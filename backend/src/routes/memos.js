const express = require('express');
const db = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function getNotifiedExpiredFilter() {
  if (db.useSupabase) {
    return `AND NOT (
      notified = 1
      AND due_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      AND COALESCE(due_time, '09:00') ~ '^[0-9]{2}:[0-9]{2}$'
      AND to_timestamp(due_date || ' ' || COALESCE(due_time, '09:00'), 'YYYY-MM-DD HH24:MI')
          <= (NOW() AT TIME ZONE 'Asia/Tokyo') - INTERVAL '7 days'
    )`;
  }
  return `AND NOT (
    notified = 1
    AND datetime(due_date || ' ' || COALESCE(due_time, '09:00'), '+7 days') <= datetime('now', 'localtime')
  )`;
}

router.get('/', async (req, res) => {
  await db.ready;
  const { type, date } = req.query;
  let sql = `SELECT * FROM memos WHERE user_id = ? ${getNotifiedExpiredFilter()}`;
  const params = [req.user.id];

  if (type) {
    sql += ' AND type = ?';
    params.push(type);
  }
  if (date) {
    sql += ' AND due_date = ?';
    params.push(date);
  }

  sql += ' ORDER BY notified ASC, due_date ASC, due_time ASC, created_at DESC';
  const memos = await db.all(sql, params);
  res.json({ memos });
});

router.post('/', async (req, res) => {
  await db.ready;
  const { type, title, content, due_date, due_time, deadline_date } = req.body;
  if (!type || !title || !due_date) {
    return res.status(400).json({ error: '種類、タイトル、日付は必須です' });
  }
  if (!['shopping', 'todo'].includes(type)) {
    return res.status(400).json({ error: '種類は shopping または todo です' });
  }

  const notifyTime = due_time || '09:00';
  if (!TIME_PATTERN.test(notifyTime)) {
    return res.status(400).json({ error: '時刻は HH:MM 形式で指定してください' });
  }

  const deadline = type === 'todo' && deadline_date ? deadline_date : null;

  const result = await db.run(
    'INSERT INTO memos (user_id, type, title, content, due_date, due_time, deadline_date) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [req.user.id, type, title, content || '', due_date, notifyTime, deadline]
  );

  const memo = await db.get('SELECT * FROM memos WHERE id = ?', [result.lastInsertRowid]);
  res.status(201).json({ memo });
});

router.put('/:id', async (req, res) => {
  await db.ready;
  const memo = await db.get('SELECT * FROM memos WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  if (!memo) return res.status(404).json({ error: 'メモが見つかりません' });

  const { title, content, due_date, due_time, deadline_date, completed } = req.body;
  if (due_time !== undefined && due_time !== null && !TIME_PATTERN.test(due_time)) {
    return res.status(400).json({ error: '時刻は HH:MM 形式で指定してください' });
  }

  await db.run(`
    UPDATE memos SET
      title = COALESCE(?, title),
      content = COALESCE(?, content),
      due_date = COALESCE(?, due_date),
      due_time = COALESCE(?, due_time),
      deadline_date = CASE WHEN ? = '__clear__' THEN NULL ELSE COALESCE(?, deadline_date) END,
      completed = COALESCE(?, completed),
      notified = CASE
        WHEN ? IS NOT NULL OR ? IS NOT NULL THEN 0
        ELSE notified
      END
    WHERE id = ?
  `, [
    title ?? null,
    content ?? null,
    due_date ?? null,
    due_time ?? null,
    deadline_date === '' ? '__clear__' : null,
    deadline_date === '' ? null : (deadline_date ?? null),
    completed !== undefined ? (completed ? 1 : 0) : null,
    due_date ?? null,
    due_time ?? null,
    req.params.id,
  ]);

  const updated = await db.get('SELECT * FROM memos WHERE id = ?', [req.params.id]);
  res.json({ memo: updated });
});

router.delete('/:id', async (req, res) => {
  await db.ready;
  const result = await db.run('DELETE FROM memos WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  if (result.changes === 0) return res.status(404).json({ error: 'メモが見つかりません' });
  res.json({ message: '削除しました' });
});

module.exports = router;
