const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const express = require('express');
const cors = require('cors');
const db = require('./db');
const authRoutes = require('./routes/auth');
const memoRoutes = require('./routes/memos');
const subscriptionRoutes = require('./routes/subscriptions');
const allergyLunchRoutes = require('./routes/allergyLunch');

const app = express();

const allowedOrigin = process.env.CORS_ORIGIN
  || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:5173');

app.use(cors({
  origin: process.env.VERCEL ? true : allowedOrigin,
}));
app.use(express.json({ limit: '12mb' }));

app.get('/api/health', async (_req, res) => {
  const base = {
    status: 'ok',
    service: 'mybutler-api',
    runtime: process.env.VERCEL ? 'vercel' : 'local',
    database: db.useSupabase ? 'supabase' : 'sqlite',
  };

  try {
    const ping = await db.ping();
    res.json({ ...base, db: ping });
  } catch (error) {
    res.status(503).json({
      ...base,
      status: 'degraded',
      db: {
        ok: false,
        error: error.message,
        connection: db.getConnectionDiagnostics(),
      },
    });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/memos', memoRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/allergy-lunch', allergyLunchRoutes);

app.use((err, _req, res, _next) => {
  console.error('API error:', err);
  res.status(500).json({ error: err.message || 'サーバーエラーが発生しました' });
});

module.exports = app;
