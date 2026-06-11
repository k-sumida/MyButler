const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.post('/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'ユーザー名とパスワードは必須です' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'パスワードは6文字以上にしてください' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(409).json({ error: 'このユーザー名は既に使用されています' });
  }

  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, hash);
  const token = jwt.sign(
    { id: result.lastInsertRowid, username },
    process.env.JWT_SECRET || 'dev-secret',
    { expiresIn: '7d' }
  );

  res.status(201).json({ token, user: { id: result.lastInsertRowid, username } });
});

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'ユーザー名とパスワードは必須です' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
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

router.get('/me', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id, username, line_user_id, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'ユーザーが見つかりません' });
  res.json({ user });
});

router.put('/line', authMiddleware, (req, res) => {
  const { line_user_id } = req.body;
  db.prepare('UPDATE users SET line_user_id = ? WHERE id = ?').run(line_user_id || null, req.user.id);
  res.json({ message: 'LINE連携を更新しました', line_user_id: line_user_id || null });
});

router.put('/password', authMiddleware, (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) {
    return res.status(400).json({ error: '現在のパスワードと新しいパスワードは必須です' });
  }
  if (new_password.length < 6) {
    return res.status(400).json({ error: '新しいパスワードは6文字以上にしてください' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user || !bcrypt.compareSync(current_password, user.password_hash)) {
    return res.status(401).json({ error: '現在のパスワードが正しくありません' });
  }

  const hash = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.user.id);
  res.json({ message: 'パスワードを変更しました' });
});

module.exports = router;
