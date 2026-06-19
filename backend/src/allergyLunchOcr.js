/**
 * OCR.space API（無料枠あり）で日本語OCR
 * https://ocr.space/ocrapi で無料APIキーを取得
 */
async function ocrWithOcrSpace(imageDataUrl) {
  const apiKey = process.env.OCR_SPACE_API_KEY;
  if (!apiKey) {
    return null;
  }

  const form = new URLSearchParams();
  form.append('apikey', apiKey);
  form.append('language', 'jpn');
  form.append('OCREngine', '2');
  form.append('isTable', 'true');
  form.append('scale', 'true');
  form.append('detectOrientation', 'true');
  form.append('base64Image', imageDataUrl);

  const response = await fetch('https://api.ocr.space/parse/image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OCR API エラー (${response.status}): ${body.slice(0, 120)}`);
  }

  const data = await response.json();
  if (data.IsErroredOnProcessing) {
    const msg = data.ErrorMessage?.[0] || data.ErrorDetails || 'OCR処理に失敗しました';
    throw new Error(msg);
  }

  const text = (data.ParsedResults || [])
    .map((r) => r.ParsedText || '')
    .filter(Boolean)
    .join('\n')
    .trim();

  return text ? { method: 'ocr-space', text } : null;
}

module.exports = { ocrWithOcrSpace };
