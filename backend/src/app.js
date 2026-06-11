const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const memoRoutes = require('./routes/memos');
const subscriptionRoutes = require('./routes/subscriptions');

const app = express();

const allowedOrigin = process.env.CORS_ORIGIN
  || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:5173');

app.use(cors({
  origin: process.env.VERCEL ? true : allowedOrigin,
}));
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'mybutler-api',
    runtime: process.env.VERCEL ? 'vercel' : 'local',
    database: process.env.DATABASE_URL || process.env.SUPABASE_DB_URL ? 'supabase' : 'sqlite',
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/memos', memoRoutes);
app.use('/api/subscriptions', subscriptionRoutes);

module.exports = app;
