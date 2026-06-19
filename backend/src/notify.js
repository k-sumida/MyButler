const db = require('./db');

async function sendLineMessage(userId, message) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
  if (!token) {
    console.warn(`[SKIP] LINE_CHANNEL_ACCESS_TOKEN未設定のため送信しません (user=${userId})`);
    return false;
  }

  const response = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      to: userId,
      messages: [{ type: 'text', text: message }],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error('LINE送信エラー:', response.status, body);
    return false;
  }
  return true;
}

async function checkAndNotify() {
  await db.ready;

  const rows = await db.all(db.getNotifyDueSql());
  const lineConfigured = !!(process.env.LINE_CHANNEL_ACCESS_TOKEN || '').trim();

  let sentCount = 0;
  let failedCount = 0;
  for (const row of rows) {
    const typeLabel = row.type === 'shopping' ? '買い物' : 'やること';
    const itemLabel = row.type === 'shopping' ? '買うもの' : 'やること';
    let message = `【MyButler リマインダー】\nユーザー: ${row.username}\n種類: ${typeLabel}\n${itemLabel}: ${row.title}\n`;
    if (row.deadline_date) message += `期日: ${row.deadline_date}\n`;
    if (row.content) message += `内容: ${row.content}\n`;
    message += `通知: ${row.due_date} ${row.due_time}`;

    const sent = await sendLineMessage(row.line_user_id, message);
    if (sent) {
      await db.run('UPDATE memos SET notified = 1 WHERE id = ?', [row.id]);
      sentCount += 1;
    } else {
      failedCount += 1;
    }
  }

  return {
    sent_count: sentCount,
    failed_count: failedCount,
    due_count: rows.length,
    line_configured: lineConfigured,
    database: db.useSupabase ? 'supabase' : 'sqlite',
    checked_at: new Date().toISOString(),
  };
}

module.exports = { checkAndNotify };
