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

const INIT_TIMEOUT_MS = 15000;

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
  let url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || '';
  if (!url.includes('sslmode=')) {
    url += `${url.includes('?') ? '&' : '?'}sslmode=require`;
  }
  return url;
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
    const postgres = require('postgres');
    const connectionString = getConnectionString();
    pgClient = postgres(connectionString, {
      ssl: 'require',
      max: 1,
      idle_timeout: 10,
      connect_timeout: 10,
      prepare: false,
    });

    await pgClient`SELECT 1`;
    await ensurePgTables();
    return;
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
}

function migrateSqlite() {
  const columns = sqliteDb.prepare('PRAGMA table_info(memos)').all().map((c) => c.name);
  if (!columns.includes('due_time')) {
    sqliteDb.exec("ALTER TABLE memos ADD COLUMN due_time TEXT NOT NULL DEFAULT '09:00'");
  }
  if (!columns.includes('deadline_date')) {
    sqliteDb.exec('ALTER TABLE memos ADD COLUMN deadline_date TEXT');
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
  await initPromise;
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

initPromise = startInit();

module.exports = {
  ready: initPromise,
  initDatabase: startInit,
  all,
  get,
  run,
  exec,
  ping,
  useSupabase,
  getNotifyDueSql,
  getInitError: () => initError,
};
