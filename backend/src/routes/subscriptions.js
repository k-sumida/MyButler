const express = require('express');
const db = require('../db');
const { detectSubscriptions } = require('../detector');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

router.get('/', async (req, res) => {
  await db.ready;
  const subs = await db.all(
    'SELECT * FROM subscriptions WHERE user_id = ? ORDER BY renewal_date ASC',
    [req.user.id]
  );

  const monthlyTotal = subs
    .filter((s) => s.is_active && s.billing_cycle === 'monthly')
    .reduce((sum, s) => sum + s.amount, 0);
  const yearlyTotal = subs
    .filter((s) => s.is_active && s.billing_cycle === 'yearly')
    .reduce((sum, s) => sum + s.amount, 0);

  res.json({
    subscriptions: subs,
    summary: {
      monthly_total: monthlyTotal,
      yearly_total: yearlyTotal,
      monthly_equivalent: monthlyTotal + yearlyTotal / 12,
      active_count: subs.filter((s) => s.is_active).length,
    },
  });
});

router.post('/', async (req, res) => {
  await db.ready;
  const { service_name, category, billing_cycle, amount, currency, renewal_date, notes } = req.body;
  if (!service_name || !category || !billing_cycle || amount === undefined || !renewal_date) {
    return res.status(400).json({ error: '必須項目が不足しています' });
  }

  const result = await db.run(`
    INSERT INTO subscriptions (user_id, service_name, category, billing_cycle, amount, currency, renewal_date, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    req.user.id,
    service_name,
    category,
    billing_cycle,
    amount,
    currency || 'JPY',
    renewal_date,
    notes || '',
  ]);

  const sub = await db.get('SELECT * FROM subscriptions WHERE id = ?', [result.lastInsertRowid]);
  res.status(201).json({ subscription: sub });
});

router.post('/detect', async (req, res) => {
  await db.ready;
  const { transactions } = req.body;
  if (!transactions || !Array.isArray(transactions)) {
    return res.status(400).json({ error: '取引データの配列が必要です' });
  }

  const detected = detectSubscriptions(transactions);
  const saved = [];

  for (const item of detected) {
    const existing = await db.get(
      'SELECT id FROM subscriptions WHERE user_id = ? AND service_name = ? AND is_active = 1',
      [req.user.id, item.service_name]
    );
    if (existing) continue;

    const renewalDate = new Date();
    renewalDate.setMonth(renewalDate.getMonth() + 1);
    const result = await db.run(`
      INSERT INTO subscriptions (user_id, service_name, category, billing_cycle, amount, currency, renewal_date, auto_detected, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
    `, [
      req.user.id,
      item.service_name,
      item.category,
      item.billing_cycle,
      item.amount,
      item.currency || 'JPY',
      renewalDate.toISOString().split('T')[0],
      `自動検出 (信頼度: ${Math.round(item.confidence * 100)}%)`,
    ]);
    saved.push(await db.get('SELECT * FROM subscriptions WHERE id = ?', [result.lastInsertRowid]));
  }

  res.json({ detected, saved, message: `${saved.length}件のサブスクリプションを登録しました` });
});

router.put('/:id', async (req, res) => {
  await db.ready;
  const sub = await db.get('SELECT * FROM subscriptions WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  if (!sub) return res.status(404).json({ error: 'サブスクリプションが見つかりません' });

  const { service_name, category, billing_cycle, amount, currency, renewal_date, is_active, notes } = req.body;
  await db.run(`
    UPDATE subscriptions SET
      service_name = COALESCE(?, service_name),
      category = COALESCE(?, category),
      billing_cycle = COALESCE(?, billing_cycle),
      amount = COALESCE(?, amount),
      currency = COALESCE(?, currency),
      renewal_date = COALESCE(?, renewal_date),
      is_active = COALESCE(?, is_active),
      notes = COALESCE(?, notes)
    WHERE id = ?
  `, [
    service_name ?? null,
    category ?? null,
    billing_cycle ?? null,
    amount ?? null,
    currency ?? null,
    renewal_date ?? null,
    is_active !== undefined ? (is_active ? 1 : 0) : null,
    notes ?? null,
    req.params.id,
  ]);

  const updated = await db.get('SELECT * FROM subscriptions WHERE id = ?', [req.params.id]);
  res.json({ subscription: updated });
});

router.delete('/:id', async (req, res) => {
  await db.ready;
  const result = await db.run('DELETE FROM subscriptions WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  if (result.changes === 0) return res.status(404).json({ error: 'サブスクリプションが見つかりません' });
  res.json({ message: '削除しました' });
});

module.exports = router;
