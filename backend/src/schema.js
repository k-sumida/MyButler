const SCHEMA_SQL = `
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
    due_time TEXT NOT NULL DEFAULT '09:00',
    deadline_date TEXT,
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

  CREATE TABLE IF NOT EXISTS allergy_lunch_months (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    year_month TEXT NOT NULL,
    user_allergens TEXT DEFAULT '[]',
    menu_data TEXT DEFAULT '{"days":[],"legend_allergens":[]}',
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, year_month)
  );

  CREATE TABLE IF NOT EXISTS allergy_lunch_images (
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
`;

module.exports = { SCHEMA_SQL };
