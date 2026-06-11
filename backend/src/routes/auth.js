const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    await db.ready;
  } catch (error) {
    return res.status(503).json({ error: error.message || 'データベースに接続できません' });
  }

  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'ユーザー名とパスワードは必須です' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'パスワードは6文字以上にしてください' });
  }

  const existing = await db.get('SELECT id FROM users WHERE username = ?', [username]);
  if (existing) {
    return res.status(409).json({ error: 'このユーザー名は既に使用されています' });
  }

  const hash = bcrypt.hashSync(password, 10);
  const result = await db.run('INSERT INTO users (username, password_hash) VALUES (?, ?)', [username, hash]);
  const token = jwt.sign(
    { id: result.lastInsertRowid, username },
    process.env.JWT_SECRET || 'dev-secret',
    { expiresIn: '7d' }
  );

  res.status(201).json({ token, user: { id: result.lastInsertRowid, username } });
});

router.post('/login', async (req, res) => {
  try {
    await db.ready;
  } catch (error) {
    return res.status(503).json({ error: error.message || 'データベースに接続できません' });
  }

  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'ユーザー名とパスワードは必須です' });
  }

  const user = await db.get('SELECT * FROM users WHERE username = ?', [username]);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'ユーザー名またはパスワードが正しくありません' });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username },
    process.env.JWT_SECRET || 'dev-secret',
    { expiresIn: '7d' }
  );

  res.json({
    token,
    user: { id: user.id, username: user.username, line_user_id: user.line_user_id },
  });
});

router.get('/me', authMiddleware, async (req, res) => {
  await db.ready;
  const user = await db.get('SELECT id, username, line_user_id, created_at FROM users WHERE id = ?', [req.user.id]);
  if (!user) return res.status(404).json({ error: 'ユーザーが見つかりません' });
  res.json({ user });
});

router.put('/line', authMiddleware, async (req, res) => {
  await db.ready;
  const { line_user_id } = req.body;
  await db.run('UPDATE users SET line_user_id = ? WHERE id = ?', [line_user_id || null, req.user.id]);
  res.json({ message: 'LINE連携を更新しました', line_user_id: line_user_id || null });
});

router.put('/password', authMiddleware, async (req, res) => {
  await db.ready;
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) {
    return res.status(400).json({ error: '現在のパスワードと新しいパスワードは必須です' });
  }
  if (new_password.length < 6) {
    return res.status(400).json({ error: '新しいパスワードは6文字以上にしてください' });
  }

  const user = await db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
  if (!user || !bcrypt.compareSync(current_password, user.password_hash)) {
    return res.status(401).json({ error: '現在のパスワードが正しくありません' });
  }

  const hash = bcrypt.hashSync(new_password, 10);
  await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.user.id]);
  res.json({ message: 'パスワードを変更しました' });
});

module.exports = router;
