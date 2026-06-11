const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const memoRoutes = require('./routes/memos');
const subscriptionRoutes = require('./routes/subscriptions');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'mybutler-api' });
});

app.use('/api/auth', authRoutes);
app.use('/api/memos', memoRoutes);
app.use('/api/subscriptions', subscriptionRoutes);

app.listen(PORT, () => {
  console.log(`MyButler API running on http://localhost:${PORT}`);
});
