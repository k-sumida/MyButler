const KNOWN_SERVICES = [
  { patterns: [/netflix/i, /ネットフリックス/], name: 'Netflix', category: '動画配信', default_amount: 1490, cycle: 'monthly' },
  { patterns: [/spotify/i, /スポティファイ/], name: 'Spotify', category: '音楽配信', default_amount: 980, cycle: 'monthly' },
  { patterns: [/apple\s*music/i, /アップルミュージック/i, /apple\.com\/bill/i], name: 'Apple Music', category: '音楽配信', default_amount: 1080, cycle: 'monthly' },
  { patterns: [/amazon\s*prime/i, /アマゾンプライム/i, /prime\s*video/i], name: 'Amazon Prime', category: '動画配信', default_amount: 600, cycle: 'monthly' },
  { patterns: [/disney\+/i, /disney\s*plus/i, /ディズニー/], name: 'Disney+', category: '動画配信', default_amount: 1140, cycle: 'monthly' },
  { patterns: [/youtube\s*premium/i, /ユーチューブプレミアム/i, /google\s*youtube/i], name: 'YouTube Premium', category: '動画配信', default_amount: 1280, cycle: 'monthly' },
  { patterns: [/hulu/i, /フールー/], name: 'Hulu', category: '動画配信', default_amount: 1026, cycle: 'monthly' },
  { patterns: [/u-next/i, /ユーネクスト/], name: 'U-NEXT', category: '動画配信', default_amount: 2189, cycle: 'monthly' },
  { patterns: [/dazn/i], name: 'DAZN', category: 'スポーツ配信', default_amount: 4200, cycle: 'monthly' },
  { patterns: [/abema/i, /アベマ/], name: 'ABEMAプレミアム', category: '動画配信', default_amount: 960, cycle: 'monthly' },
  { patterns: [/line\s*music/i, /ラインミュージック/], name: 'LINE MUSIC', category: '音楽配信', default_amount: 980, cycle: 'monthly' },
  { patterns: [/awa/i, /アワ/], name: 'AWA', category: '音楽配信', default_amount: 980, cycle: 'monthly' },
  { patterns: [/icloud/i, /アイクラウド/], name: 'iCloud+', category: 'クラウドストレージ', default_amount: 130, cycle: 'monthly' },
  { patterns: [/google\s*one/i, /グーグルワン/], name: 'Google One', category: 'クラウドストレージ', default_amount: 250, cycle: 'monthly' },
  { patterns: [/microsoft\s*365/i, /office\s*365/i], name: 'Microsoft 365', category: '生産性', default_amount: 1490, cycle: 'monthly' },
  { patterns: [/adobe/i, /アドビ/], name: 'Adobe Creative Cloud', category: '生産性', default_amount: 6480, cycle: 'monthly' },
  { patterns: [/dropbox/i], name: 'Dropbox', category: 'クラウドストレージ', default_amount: 1500, cycle: 'monthly' },
  { patterns: [/nintendo\s*switch\s*online/i, /ニンテンドー/], name: 'Nintendo Switch Online', category: 'ゲーム', default_amount: 306, cycle: 'monthly' },
  { patterns: [/playstation\s*plus/i, /ps\s*plus/i], name: 'PlayStation Plus', category: 'ゲーム', default_amount: 850, cycle: 'monthly' },
  { patterns: [/xbox\s*game\s*pass/i], name: 'Xbox Game Pass', category: 'ゲーム', default_amount: 1100, cycle: 'monthly' },
  { patterns: [/chatgpt/i, /openai/i], name: 'ChatGPT Plus', category: 'AI', default_amount: 3000, cycle: 'monthly' },
  { patterns: [/notion/i], name: 'Notion', category: '生産性', default_amount: 1000, cycle: 'monthly' },
];

function extractAmount(text) {
  const patterns = [/¥\s*([\d,]+)/, /([\d,]+)\s*円/, /JPY\s*([\d,]+)/i, /\$\s*([\d.]+)/];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return parseFloat(match[1].replace(/,/g, ''));
  }
  return null;
}

function detectSubscriptions(transactions) {
  const detected = [];
  const seen = new Set();

  for (const tx of transactions) {
    const description = `${tx.description || ''} ${tx.merchant || ''}`.trim();

    for (const service of KNOWN_SERVICES) {
      if (seen.has(service.name)) continue;

      const matched = service.patterns.some((pattern) => pattern.test(description));
      if (!matched) continue;

      const amount = tx.amount || extractAmount(description) || service.default_amount;
      const cycle = tx.billing_cycle === 'yearly' ? 'yearly' : service.cycle;

      detected.push({
        service_name: service.name,
        category: service.category,
        billing_cycle: cycle,
        amount: Number(amount),
        currency: tx.currency || 'JPY',
        confidence: tx.amount ? 0.85 : 0.7,
        matched_text: description,
      });
      seen.add(service.name);
      break;
    }
  }

  return detected;
}

module.exports = { detectSubscriptions, KNOWN_SERVICES };
