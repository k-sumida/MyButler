const path = require('path');
const fs = require('fs');
const { SCHEMA_SQL } = require('./schema');
const { SCHEMA_PG_STATEMENTS, NOTIFY_DUE_SQL } = require('./schema-pg');

const SQLITE_NOTIFY_DUE_SQL = `
  SELECT m.id, m.type, m.title, m.content, m.due_date,
         COALESCE(m.due_time, '09:00') AS due_time,
         m.deadline_date,
         u.line_user_id, u.username
  FROM memos m
  JOIN users u ON m.user_id = u.id
  WHERE m.completed = 0
    AND m.notified = 0
    AND u.line_user_id IS NOT NULL
    AND u.line_user_id != ''
    AND datetime(m.due_date || ' ' || COALESCE(m.due_time, '09:00')) <= datetime('now', 'localtime')
`;

const onVercel = !!process.env.VERCEL;
const INIT_TIMEOUT_MS = onVercel ? 25000 : 30000;
const CONNECT_RETRIES = onVercel ? 2 : 3;

const useSupabase = !!(process.env.DATABASE_URL || process.env.SUPABASE_DB_URL);

let pgClient = null;
let sqliteDb = null;
let initPromise = null;
let initError = null;

function loadSqlite() {
  try {
    return require('better-sqlite3');
  } catch {
    return null;
  }
}

function getConnectionString() {
  const raw = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || '';
  if (!raw) return raw;

  try {
    const parsed = new URL(raw);
    const params = parsed.searchParams;

    if (!params.has('sslmode')) {
      params.set('sslmode', 'require');
    }

    const usesPooler = parsed.hostname.includes('pooler.supabase.com');
    if (usesPooler || parsed.port === '6543') {
      if (!params.has('pgbouncer')) {
        params.set('pgbouncer', 'true');
      }
    }

    parsed.search = params.toString();
    return parsed.toString();
  } catch {
    let url = raw;
    if (!url.includes('sslmode=')) {
      url += `${url.includes('?') ? '&' : '?'}sslmode=require`;
    }
    if (url.includes('pooler.supabase.com') && !url.includes('pgbouncer=')) {
      url += `${url.includes('?') ? '&' : '?'}pgbouncer=true`;
    }
    return url;
  }
}

function getConnectionDiagnostics() {
  const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || '';
  if (!url) return { configured: false };

  try {
    const parsed = new URL(url);
    return {
      configured: true,
      host: parsed.hostname,
      port: parsed.port,
      user: parsed.username,
      usesPooler: parsed.hostname.includes('pooler.supabase.com'),
      usesTransactionPort: parsed.port === '6543',
    };
  } catch {
    return { configured: true, parseError: true };
  }
}

function formatDbError(error) {
  const message = error?.message || String(error);
  if (!message.includes('CONNECT_TIMEOUT') && !message.includes('タイムアウト')) {
    return message;
  }

  const diag = getConnectionDiagnostics();
  const hints = [
    'Supabase プロジェクトが一時停止していないか確認（ダッシュボードで Restore）',
    'Database → Network で IP 制限が有効になっていないか確認',
    'Connect → Transaction pooler（port 6543）の URI を使用しているか確認',
    '接続文字列に ?pgbouncer=true が付いているか確認',
    'ユーザー名が postgres.[project-ref] 形式か確認',
    'パスワードの特殊文字は URL エンコードされているか確認',
  ];

  return `${message} | host=${diag.host || 'unknown'} port=${diag.port || 'unknown'} | ${hints.join(' / ')}`;
}

async function closePostgres() {
  if (!pgClient) return;
  try {
    await pgClient.end({ timeout: 5 });
  } catch {
    // ignore close errors on stale connections
  }
  pgClient = null;
}

async function connectPostgres() {
  const postgres = require('postgres');
  await closePostgres();

  const connectionString = getConnectionString();
  pgClient = postgres(connectionString, {
    ssl: 'require',
    max: 1,
    idle_timeout: onVercel ? 10 : 20,
    connect_timeout: onVercel ? 15 : 25,
    prepare: false,
    fetch_types: false,
    application_name: 'mybutler',
  });
  await pgClient`SELECT 1`;
}

async function connectWithRetry() {
  let lastError;
  for (let attempt = 1; attempt <= CONNECT_RETRIES; attempt += 1) {
    try {
      await connectPostgres();
      return;
    } catch (error) {
      lastError = error;
      if (attempt < CONNECT_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }
  throw new Error(formatDbError(lastError));
}

function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), ms);
    }),
  ]);
}

function toPgSql(sql, params) {
  let index = 0;
  const text = sql.replace(/\?/g, () => `$${++index}`);
  return { text, values: params };
}

function rowToObject(row) {
  if (!row) return null;
  return row;
}

async function ensurePgTables() {
  const existing = await pgClient`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'users'
  `;
  if (existing.length > 0) {
    await migratePostgres();
    return;
  }

  for (const statement of SCHEMA_PG_STATEMENTS) {
    await pgClient.unsafe(statement);
  }
  await migratePostgres();
}

async function initDatabase() {
  if (useSupabase) {
    await connectWithRetry();
    await ensurePgTables();
    return;
  }

  if (process.env.VERCEL) {
    throw new Error(
      'Vercel に DATABASE_URL が未設定です。Supabase の Transaction pooler（port 6543）接続文字列を環境変数に追加してください。'
    );
  }

  const Sqlite = loadSqlite();
  if (!Sqlite) {
    throw new Error(
      'データベースが設定されていません。ローカルでは better-sqlite3、本番では Supabase の DATABASE_URL を設定してください。'
    );
  }

  const dbPath = process.env.DB_PATH || path.join(__dirname, '../../data/mybutler.db');
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

  sqliteDb = new Sqlite(dbPath);
  sqliteDb.pragma('journal_mode = WAL');
  sqliteDb.pragma('foreign_keys = ON');
  sqliteDb.exec(SCHEMA_SQL);
  migrateSqlite();
}

async function migratePostgres() {
  const columns = await all(`
    SELECT column_name AS name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'memos'
  `);
  const names = columns.map((c) => c.name);
  if (!names.includes('due_time')) {
    await exec("ALTER TABLE memos ADD COLUMN due_time TEXT NOT NULL DEFAULT '09:00'");
  }
  if (!names.includes('deadline_date')) {
    await exec('ALTER TABLE memos ADD COLUMN deadline_date TEXT');
  }

  const allergyMonths = await all(`
    SELECT table_name AS name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'allergy_lunch_months'
  `);
  if (allergyMonths.length === 0) {
    await exec(`CREATE TABLE allergy_lunch_months (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      year_month TEXT NOT NULL,
      user_allergens TEXT DEFAULT '[]',
      menu_data TEXT DEFAULT '{"days":[],"legend_allergens":[]}',
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, year_month)
    )`);
    await exec(`CREATE TABLE allergy_lunch_images (
      id SERIAL PRIMARY KEY,
      month_id INTEGER NOT NULL REFERENCES allergy_lunch_months(id) ON DELETE CASCADE,
      slot INTEGER NOT NULL CHECK(slot IN (1, 2)),
      ocr_text TEXT,
      parsed_data TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(month_id, slot)
    )`);
    await exec('CREATE INDEX IF NOT EXISTS idx_allergy_lunch_months_user ON allergy_lunch_months(user_id, year_month)');
  }
}

function migrateSqlite() {
  const columns = sqliteDb.prepare('PRAGMA table_info(memos)').all().map((c) => c.name);
  if (!columns.includes('due_time')) {
    sqliteDb.exec("ALTER TABLE memos ADD COLUMN due_time TEXT NOT NULL DEFAULT '09:00'");
  }
  if (!columns.includes('deadline_date')) {
    sqliteDb.exec('ALTER TABLE memos ADD COLUMN deadline_date TEXT');
  }

  const allergyTable = sqliteDb.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='allergy_lunch_months'",
  ).get();
  if (!allergyTable) {
    sqliteDb.exec(`
      CREATE TABLE allergy_lunch_months (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        year_month TEXT NOT NULL,
        user_allergens TEXT DEFAULT '[]',
        menu_data TEXT DEFAULT '{"days":[],"legend_allergens":[]}',
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(user_id, year_month)
      );
      CREATE TABLE allergy_lunch_images (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        month_id INTEGER NOT NULL,
        slot INTEGER NOT NULL CHECK(slot IN (1, 2)),
        ocr_text TEXT,
        parsed_data TEXT,
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (month_id) REFERENCES allergy_lunch_months(id) ON DELETE CASCADE,
        UNIQUE(month_id, slot)
      );
      CREATE INDEX IF NOT EXISTS idx_allergy_lunch_months_user ON allergy_lunch_months(user_id, year_month);
    `);
  }
}

async function all(sql, params = []) {
  if (useSupabase) {
    const { text, values } = toPgSql(sql, params);
    const rows = await pgClient.unsafe(text, values);
    return rows.map((row) => {
      const obj = { ...row };
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'bigint') obj[key] = Number(value);
        if (value instanceof Date) {
          obj[key] = value.toISOString();
        }
      }
      return obj;
    });
  }
  return sqliteDb.prepare(sql).all(...params);
}

async function get(sql, params = []) {
  if (useSupabase) {
    const rows = await all(sql, params);
    return rows[0] || null;
  }
  return rowToObject(sqliteDb.prepare(sql).get(...params));
}

async function run(sql, params = []) {
  if (useSupabase) {
    const trimmed = sql.trim();
    const isInsert = /^INSERT/i.test(trimmed);
    let { text, values } = toPgSql(sql, params);
    if (isInsert && !/RETURNING/i.test(text)) {
      text += ' RETURNING id';
    }
    const result = await pgClient.unsafe(text, values);
    if (isInsert) {
      return {
        changes: result.length,
        lastInsertRowid: Number(result[0]?.id || 0),
      };
    }
    return {
      changes: result.count ?? 0,
      lastInsertRowid: 0,
    };
  }
  return sqliteDb.prepare(sql).run(...params);
}

async function exec(sql) {
  if (useSupabase) {
    await pgClient.unsafe(sql);
    return;
  }
  sqliteDb.exec(sql);
}

async function ping() {
  await ensureInitStarted();
  if (useSupabase) {
    await pgClient`SELECT 1`;
    return { ok: true, database: 'supabase' };
  }
  sqliteDb.prepare('SELECT 1').get();
  return { ok: true, database: 'sqlite' };
}

function getNotifyDueSql() {
  return useSupabase ? NOTIFY_DUE_SQL : SQLITE_NOTIFY_DUE_SQL;
}

function startInit() {
  initError = null;
  initPromise = withTimeout(
    initDatabase(),
    INIT_TIMEOUT_MS,
    'データベース接続がタイムアウトしました。DATABASE_URL（Transaction pooler・port 6543）を確認してください。'
  ).catch((error) => {
    initError = error;
    throw error;
  });
  return initPromise;
}

function ensureInitStarted() {
  if (!initPromise) {
    startInit();
  }
  return initPromise;
}

module.exports = {
  get ready() {
    return ensureInitStarted();
  },
  initDatabase: startInit,
  all,
  get,
  run,
  exec,
  ping,
  useSupabase,
  getNotifyDueSql,
  getInitError: () => initError,
  getConnectionDiagnostics,
};
