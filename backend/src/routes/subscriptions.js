const express = require('express');
const { db } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

router.get('/', (req, res) => {
  const subs = db
    .prepare('SELECT * FROM subscriptions WHERE user_id = ? ORDER BY renewal_date ASC')
    .all(req.user.id);

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

router.post('/', (req, res) => {
  const { service_name, category, billing_cycle, amount, currency, renewal_date, notes } = req.body;
  if (!service_name || !category || !billing_cycle || amount === undefined || !renewal_date) {
    return res.status(400).json({ error: '必須項目が不足しています' });
  }

  const result = db.prepare(`
    INSERT INTO subscriptions (user_id, service_name, category, billing_cycle, amount, currency, renewal_date, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.user.id,
    service_name,
    category,
    billing_cycle,
    amount,
    currency || 'JPY',
    renewal_date,
    notes || ''
  );

  const sub = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ subscription: sub });
});

router.post('/detect', async (req, res) => {
  const { transactions } = req.body;
  if (!transactions || !Array.isArray(transactions)) {
    return res.status(400).json({ error: '取引データの配列が必要です' });
  }

  const detectorUrl = process.env.SUBSCRIPTION_DETECTOR_URL || 'http://localhost:5001';
  try {
    const response = await fetch(`${detectorUrl}/detect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactions }),
    });
    if (!response.ok) throw new Error('検出サービスに接続できません');
    const data = await response.json();

    const insert = db.prepare(`
      INSERT INTO subscriptions (user_id, service_name, category, billing_cycle, amount, currency, renewal_date, auto_detected, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
    `);

    const saved = [];
    for (const detected of data.detected) {
      const existing = db
        .prepare('SELECT id FROM subscriptions WHERE user_id = ? AND service_name = ? AND is_active = 1')
        .get(req.user.id, detected.service_name);
      if (existing) continue;

      const renewalDate = new Date();
      renewalDate.setMonth(renewalDate.getMonth() + 1);
      const result = insert.run(
        req.user.id,
        detected.service_name,
        detected.category,
        detected.billing_cycle,
        detected.amount,
        detected.currency || 'JPY',
        renewalDate.toISOString().split('T')[0],
        `自動検出 (信頼度: ${Math.round(detected.confidence * 100)}%)`
      );
      saved.push(db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(result.lastInsertRowid));
    }

    res.json({ detected: data.detected, saved, message: `${saved.length}件のサブスクリプションを登録しました` });
  } catch (err) {
    res.status(502).json({ error: 'サブスクリプション検出サービスに接続できません', detail: err.message });
  }
});

router.put('/:id', (req, res) => {
  const sub = db.prepare('SELECT * FROM subscriptions WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!sub) return res.status(404).json({ error: 'サブスクリプションが見つかりません' });

  const { service_name, category, billing_cycle, amount, currency, renewal_date, is_active, notes } = req.body;
  db.prepare(`
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
  `).run(
    service_name ?? null,
    category ?? null,
    billing_cycle ?? null,
    amount ?? null,
    currency ?? null,
    renewal_date ?? null,
    is_active !== undefined ? (is_active ? 1 : 0) : null,
    notes ?? null,
    req.params.id
  );

  const updated = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(req.params.id);
  res.json({ subscription: updated });
});

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM subscriptions WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  if (result.changes === 0) return res.status(404).json({ error: 'サブスクリプションが見つかりません' });
  res.json({ message: '削除しました' });
});

module.exports = router;
