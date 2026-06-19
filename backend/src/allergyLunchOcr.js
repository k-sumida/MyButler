const STANDARD_ALLERGENS = [
  'えび', 'かに', 'くるみ', '小麦', 'そば', '卵', '乳',
  'あわび', 'いか', 'いくら', 'オレンジ', 'カシューナッツ', 'キウイ', '牛肉',
  'ごま', 'さけ', 'さば', '大豆', '鶏肉', 'バナナ', '豚肉', 'まつたけ',
  'もも', 'やまいも', 'りんご', 'ゼラチン', '落花生', '杏仁',
];

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

function buildPrompt(yearMonth) {
  const allergenList = STANDARD_ALLERGENS.join('、');
  return `この画像は日本の学校給食の献立表です。対象月は ${yearMonth} です。
画像から献立表を読み取り、次のJSON形式のみで返してください（説明文は不要）。

{
  "legend_allergens": ["アレルギー原因食品等に記載されている物質名の配列"],
  "days": [
    {
      "day": 1,
      "weekday": "月",
      "menu": "その日の献立を改行または / でつなげた文字列",
      "allergens": ["その日の献立に含まれるアレルギー物質"]
    }
  ],
  "ocr_summary": "読み取った内容の要約テキスト"
}

ルール:
- day は日付（1〜31の整数）
- weekday は 日/月/火/水/木/金/土
- 「アレルギー原因食品等」の欄から legend_allergens を抽出
- 献立中の括弧書き・記号・番号から allergens を推定
- 使用可能なアレルギー物質の参考: ${allergenList}
- 表形式（カレンダー型）の場合も、日ごとに1行ずつ days に展開
- 読み取れない日は含めない
- 日本語で正確に読み取ること`;
}

function normalizeVisionResult(raw, yearMonth) {
  const [year, month] = yearMonth.split('-').map(Number);
  const legend_allergens = [...new Set((raw.legend_allergens || []).filter(Boolean))];
  const days = (raw.days || [])
    .map((d) => {
      const dayNum = Number(d.day);
      if (!dayNum || dayNum < 1 || dayNum > 31) return null;
      const allergens = [...new Set((d.allergens || []).filter(Boolean))];
      return {
        day: dayNum,
        date: `${year}-${String(month).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`,
        weekday: d.weekday || WEEKDAYS[new Date(year, month - 1, dayNum).getDay()],
        menu: String(d.menu || '').trim(),
        allergens,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.day - b.day);

  return {
    days,
    legend_allergens,
    ocr_summary: raw.ocr_summary || '',
  };
}

async function extractWithOpenAI(imageDataUrl, yearMonth) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_VISION_MODEL || 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: buildPrompt(yearMonth) },
            { type: 'image_url', image_url: { url: imageDataUrl, detail: 'high' } },
          ],
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 4096,
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`AI読み取りに失敗しました (${response.status}): ${body.slice(0, 200)}`);
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('AIからの応答が空でした');
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('AI応答のJSON解析に失敗しました');
  }

  const normalized = normalizeVisionResult(parsed, yearMonth);
  return {
    method: 'openai-vision',
    ocr_text: parsed.ocr_summary || JSON.stringify(parsed, null, 2),
    parsed_data: {
      days: normalized.days,
      legend_allergens: normalized.legend_allergens,
    },
  };
}

module.exports = { extractMenuFromImage: extractWithOpenAI, normalizeVisionResult };
