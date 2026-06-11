const { checkAndNotify } = require('../../backend/src/notify');

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
    const result = await checkAndNotify();
    return res.status(200).json(result);
  } catch (error) {
    console.error('Cron notify error:', error);
    return res.status(500).json({ error: '通知処理に失敗しました', detail: error.message });
  }
};
