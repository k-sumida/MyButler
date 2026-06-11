const db = require('../../backend/src/db');
const { checkAndNotify } = require('../../backend/src/notify');

async function ensureDbReady() {
  try {
    await db.ready;
  } catch (firstError) {
    console.warn('DB init failed, retrying once:', firstError.message);
    await db.initDatabase();
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  try {
    await ensureDbReady();
    const result = await checkAndNotify();
    return res.status(200).json(result);
  } catch (error) {
    console.error('Cron notify error:', error);
    const status = error.message?.includes('DATABASE_URL') ? 503 : 500;
    return res.status(status).json({
      error: '通知処理に失敗しました',
      detail: error.message,
      database: db.useSupabase ? 'supabase' : 'sqlite',
      connection: db.getConnectionDiagnostics(),
    });
  }
};
