const jwt = require('jsonwebtoken');

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: '認証が必要です' });
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
    req.user = { id: payload.id, username: payload.username };
    next();
  } catch {
    return res.status(401).json({ error: 'トークンが無効です' });
  }
}

module.exports = { authMiddleware };
