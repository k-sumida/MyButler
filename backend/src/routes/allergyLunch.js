const express = require('express');
const db = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { extractMenuFromImage } = require('../allergyLunchOcr');

const router = express.Router();
router.use(authMiddleware);

const YEAR_MONTH_PATTERN = /^\d{4}-\d{2}$/;

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function serializeMonth(row, images = []) {
  if (!row) return null;
  return {
    year_month: row.year_month,
    user_allergens: parseJson(row.user_allergens, []),
    menu_data: parseJson(row.menu_data, { days: [], legend_allergens: [] }),
    images: images.map((img) => ({
      slot: img.slot,
      ocr_text: img.ocr_text || '',
      parsed_data: parseJson(img.parsed_data, null),
      has_data: !!(img.ocr_text || img.parsed_data),
      updated_at: img.updated_at,
    })),
    updated_at: row.updated_at,
  };
}

async function getMonthRecord(userId, yearMonth) {
  return db.get(
    'SELECT * FROM allergy_lunch_months WHERE user_id = ? AND year_month = ?',
    [userId, yearMonth],
  );
}

async function getMonthImages(monthId) {
  return db.all(
    'SELECT slot, ocr_text, parsed_data, updated_at FROM allergy_lunch_images WHERE month_id = ? ORDER BY slot',
    [monthId],
  );
}

router.get('/months', async (req, res) => {
  await db.ready;
  const rows = await db.all(
    'SELECT year_month, updated_at FROM allergy_lunch_months WHERE user_id = ? ORDER BY year_month DESC',
    [req.user.id],
  );
  res.json({ months: rows });
});

router.post('/ocr', async (req, res) => {
  await db.ready;
  const { image_data_url, year_month } = req.body;
  if (!image_data_url || !year_month) {
    return res.status(400).json({ error: 'image_data_url と year_month が必要です' });
  }
  if (!YEAR_MONTH_PATTERN.test(year_month)) {
    return res.status(400).json({ error: 'year_month は YYYY-MM 形式で指定してください' });
  }

  try {
    const result = await extractMenuFromImage(image_data_url, year_month);
    if (!result) {
      return res.status(503).json({
        error: 'OPENAI_API_KEY が設定されていません。Vercelの環境変数に設定してください。',
      });
    }
    res.json(result);
  } catch (err) {
    console.error('allergy-lunch OCR error:', err);
    res.status(500).json({ error: err.message || '画像の読み取りに失敗しました' });
  }
});

router.get('/:yearMonth', async (req, res) => {
  await db.ready;
  const { yearMonth } = req.params;
  if (!YEAR_MONTH_PATTERN.test(yearMonth)) {
    return res.status(400).json({ error: 'year_month は YYYY-MM 形式で指定してください' });
  }

  const row = await getMonthRecord(req.user.id, yearMonth);
  if (!row) {
    return res.json({
      year_month: yearMonth,
      user_allergens: [],
      menu_data: { days: [], legend_allergens: [] },
      images: [{ slot: 1, ocr_text: '', has_data: false }, { slot: 2, ocr_text: '', has_data: false }],
    });
  }

  const images = await getMonthImages(row.id);
  res.json(serializeMonth(row, images));
});

router.put('/:yearMonth', async (req, res) => {
  await db.ready;
  const { yearMonth } = req.params;
  if (!YEAR_MONTH_PATTERN.test(yearMonth)) {
    return res.status(400).json({ error: 'year_month は YYYY-MM 形式で指定してください' });
  }

  const { user_allergens, menu_data } = req.body;
  const allergensJson = JSON.stringify(user_allergens || []);
  const menuJson = JSON.stringify(menu_data || { days: [], legend_allergens: [] });
  const now = new Date().toISOString();

  let row = await getMonthRecord(req.user.id, yearMonth);
  if (row) {
    await db.run(
      'UPDATE allergy_lunch_months SET user_allergens = ?, menu_data = ?, updated_at = ? WHERE id = ?',
      [allergensJson, menuJson, now, row.id],
    );
  } else {
    const result = await db.run(
      `INSERT INTO allergy_lunch_months (user_id, year_month, user_allergens, menu_data)
       VALUES (?, ?, ?, ?)`,
      [req.user.id, yearMonth, allergensJson, menuJson],
    );
    row = await db.get('SELECT * FROM allergy_lunch_months WHERE id = ?', [result.lastInsertRowid]);
  }

  const images = await getMonthImages(row.id);
  res.json(serializeMonth(row, images));
});

router.put('/:yearMonth/images/:slot', async (req, res) => {
  await db.ready;
  const { yearMonth, slot } = req.params;
  const slotNum = Number(slot);

  if (!YEAR_MONTH_PATTERN.test(yearMonth)) {
    return res.status(400).json({ error: 'year_month は YYYY-MM 形式で指定してください' });
  }
  if (![1, 2].includes(slotNum)) {
    return res.status(400).json({ error: '画像スロットは 1 または 2 です' });
  }

  const { ocr_text, parsed_data } = req.body;
  if (!ocr_text && !parsed_data) {
    return res.status(400).json({ error: 'ocr_text または parsed_data が必要です' });
  }

  let row = await getMonthRecord(req.user.id, yearMonth);
  if (!row) {
    const result = await db.run(
      `INSERT INTO allergy_lunch_months (user_id, year_month, user_allergens, menu_data)
       VALUES (?, ?, ?, ?)`,
      [req.user.id, yearMonth, '[]', '{"days":[],"legend_allergens":[]}'],
    );
    row = await db.get('SELECT * FROM allergy_lunch_months WHERE id = ?', [result.lastInsertRowid]);
  }

  const existing = await db.get(
    'SELECT id FROM allergy_lunch_images WHERE month_id = ? AND slot = ?',
    [row.id, slotNum],
  );

  const parsedJson = JSON.stringify(parsed_data || {});
  const ocrText = ocr_text || '';
  const now = new Date().toISOString();

  if (existing) {
    await db.run(
      'UPDATE allergy_lunch_images SET ocr_text = ?, parsed_data = ?, updated_at = ? WHERE id = ?',
      [ocrText, parsedJson, now, existing.id],
    );
  } else {
    await db.run(
      `INSERT INTO allergy_lunch_images (month_id, slot, ocr_text, parsed_data)
       VALUES (?, ?, ?, ?)`,
      [row.id, slotNum, ocrText, parsedJson],
    );
  }

  row = await getMonthRecord(req.user.id, yearMonth);
  const images = await getMonthImages(row.id);
  res.json(serializeMonth(row, images));
});

module.exports = router;
