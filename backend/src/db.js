const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DB_PATH || path.join(__dirname, '../../data/mybutler.db');
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      line_user_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS memos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('shopping', 'todo')),
      title TEXT NOT NULL,
      content TEXT,
      due_date TEXT NOT NULL,
      completed INTEGER DEFAULT 0,
      notified INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      service_name TEXT NOT NULL,
      category TEXT NOT NULL,
      billing_cycle TEXT NOT NULL CHECK(billing_cycle IN ('monthly', 'yearly')),
      amount REAL NOT NULL,
      currency TEXT DEFAULT 'JPY',
      renewal_date TEXT NOT NULL,
      auto_detected INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_memos_user_due ON memos(user_id, due_date);
    CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
  `);

  migrateDatabase();
}

function migrateDatabase() {
  const columns = db.prepare('PRAGMA table_info(memos)').all().map((c) => c.name);
  if (!columns.includes('due_time')) {
    db.exec("ALTER TABLE memos ADD COLUMN due_time TEXT NOT NULL DEFAULT '09:00'");
  }
  if (!columns.includes('deadline_date')) {
    db.exec('ALTER TABLE memos ADD COLUMN deadline_date TEXT');
  }
}

initDatabase();

module.exports = { db, initDatabase };
