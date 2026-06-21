const { extractTablesWithDocumentAi } = require('./allergyLunchDocumentAi');
const { textToTableFallback } = require('./allergyLunchParser');

let visionClient = null;

function parseCredentials() {
  const raw = process.env.GOOGLE_CLOUD_VISION_CREDENTIALS;
  if (!raw) return null;
  try {
    const credentials = JSON.parse(raw);
    if (credentials.private_key) {
      credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
    }
    return credentials;
  } catch {
    throw new Error('GOOGLE_CLOUD_VISION_CREDENTIALS のJSON形式が不正です');
  }
}

function getVisionClient() {
  if (visionClient) return visionClient;
  const credentials = parseCredentials();
  if (!credentials) return null;

  // eslint-disable-next-line global-require
  const vision = require('@google-cloud/vision');
  visionClient = new vision.ImageAnnotatorClient({ credentials });
  return visionClient;
}

function extractBase64(imageDataUrl) {
  const match = String(imageDataUrl).match(/^data:image\/\w+;base64,(.+)$/);
  return match ? match[1] : imageDataUrl;
}

async function ocrWithGoogleVision(imageDataUrl) {
  const client = getVisionClient();
  if (!client) return null;

  const content = extractBase64(imageDataUrl);
  const [result] = await client.documentTextDetection({
    image: { content },
    imageContext: { languageHints: ['ja'] },
  });

  const text = result.fullTextAnnotation?.text?.trim() || '';
  if (!text) return null;

  return { method: 'google-vision', text };
}

async function ocrWithOcrSpace(imageDataUrl) {
  const apiKey = process.env.OCR_SPACE_API_KEY;
  if (!apiKey) return null;

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

/**
 * Cloud Vision で読み取り → Document AI で表形式に整形
 */
async function recognizeMenuImage(imageDataUrl, yearMonth) {
  const visionResult = await ocrWithGoogleVision(imageDataUrl);
  const ocrResult = visionResult || await ocrWithOcrSpace(imageDataUrl);

  if (!ocrResult?.text) {
    return null;
  }

  const { text } = ocrResult;
  let tables = [];
  let method = ocrResult.method;

  try {
    const docResult = await extractTablesWithDocumentAi(imageDataUrl);
    if (docResult?.tables?.length) {
      tables = docResult.tables;
      method = `${ocrResult.method}+document-ai`;
    }
  } catch (err) {
    console.warn('Document AI table extraction failed:', err.message);
  }

  if (!tables.length && yearMonth) {
    const fallback = textToTableFallback(text, yearMonth);
    if (fallback?.tables?.length) {
      tables = fallback.tables;
      method = `${ocrResult.method}+text-fallback`;
    }
  }

  return {
    method,
    text,
    parsed_data: { tables },
  };
}

module.exports = {
  recognizeMenuImage,
  ocrWithGoogleVision,
  ocrWithOcrSpace,
};
