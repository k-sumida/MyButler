const MIN_WIDTH = 2000;
const MAX_WIDTH = 3200;

function toHalfWidthDigits(text) {
  return text.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('画像の読み込みに失敗しました'));
    };
    img.src = url;
  });
}

function scaleDimensions(width, height) {
  let w = width;
  let h = height;
  if (w < MIN_WIDTH) {
    const scale = MIN_WIDTH / w;
    w = MIN_WIDTH;
    h = Math.round(h * scale);
  } else if (w > MAX_WIDTH) {
    const scale = MAX_WIDTH / w;
    w = MAX_WIDTH;
    h = Math.round(h * scale);
  }
  return { width: w, height: h };
}

function applyGrayscaleContrast(ctx, width, height, { binary = false, contrast = 1.3 } = {}) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const { data } = imageData;
  let min = 255;
  let max = 0;

  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const adjusted = Math.min(255, Math.max(0, (gray - 128) * contrast + 128));
    data[i] = data[i + 1] = data[i + 2] = adjusted;
    if (adjusted < min) min = adjusted;
    if (adjusted > max) max = adjusted;
  }

  if (binary) {
    const threshold = min + (max - min) * 0.5;
    for (let i = 0; i < data.length; i += 4) {
      const v = data[i] > threshold ? 255 : 0;
      data[i] = data[i + 1] = data[i + 2] = v;
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

function renderVariant(img, { binary = false, contrast = 1.3, mime = 'image/png' } = {}) {
  const { width, height } = scaleDimensions(img.width, img.height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  applyGrayscaleContrast(ctx, width, height, { binary, contrast });
  const quality = mime === 'image/jpeg' ? 0.92 : undefined;
  return canvas.toDataURL(mime, quality);
}

/**
 * OCR用に複数バリエーションの画像を生成
 */
export async function buildOcrVariants(file) {
  const img = await loadImageFromFile(file);
  return [
    renderVariant(img, { binary: false, contrast: 1.2, mime: 'image/jpeg' }),
    renderVariant(img, { binary: false, contrast: 1.5, mime: 'image/png' }),
    renderVariant(img, { binary: true, contrast: 1.4, mime: 'image/png' }),
  ];
}

/** @deprecated buildOcrVariants の1枚目を返す */
export async function prepareImageForOcr(file) {
  const variants = await buildOcrVariants(file);
  return variants[0];
}

export function scoreOcrText(text) {
  const normalized = toHalfWidthDigits(text || '');
  const japanese = (normalized.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/g) || []).length;
  const dayMarks = (normalized.match(/\d{1,2}\s*日?\s*[月火水木金土日]/g) || []).length;
  const garbage = (normalized.match(/[^\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\d\s/、。・（）()\-\n]/g) || []).length;
  return japanese + dayMarks * 20 - garbage * 2;
}

function mergeOcrTexts(texts) {
  const combined = texts.filter(Boolean).join('\n\n---\n\n');
  const lines = new Set();
  for (const text of texts) {
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.length >= 2) lines.add(trimmed);
    }
  }
  const merged = [...lines].join('\n');
  return scoreOcrText(merged) >= scoreOcrText(combined) ? merged : combined;
}

async function recognizeWithTesseract(imageDataUrl, worker, onProgress) {
  const { PSM } = await import('tesseract.js');
  const modes = [PSM.AUTO, PSM.SINGLE_BLOCK, PSM.SINGLE_COLUMN, PSM.SPARSE_TEXT];
  let bestText = '';
  let bestScore = -Infinity;

  await worker.setParameters({ preserve_interword_spaces: '1' });

  for (let i = 0; i < modes.length; i += 1) {
    if (onProgress) onProgress(Math.round((i / modes.length) * 100));
    await worker.setParameters({ tessedit_pageseg_mode: modes[i] });
    const { data } = await worker.recognize(imageDataUrl);
    const text = toHalfWidthDigits(data.text || '').trim();
    const score = scoreOcrText(text);
    if (score > bestScore) {
      bestScore = score;
      bestText = text;
    }
  }

  return bestText;
}

/**
 * Tesseract.js で日本語 OCR（無料・ブラウザ内処理）
 */
export async function runOcr(imageDataUrl, onProgress) {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('jpn', 1, {
    logger: (m) => {
      if (m.status === 'recognizing text' && onProgress) {
        onProgress(Math.round((m.progress || 0) * 100));
      }
    },
  });

  try {
    const text = await recognizeWithTesseract(imageDataUrl, worker, onProgress);
    if (onProgress) onProgress(100);
    return text;
  } finally {
    await worker.terminate();
  }
}

/**
 * 複数画像バリエーションで OCR し、最良の結果をマージ
 */
export async function runOcrFromFile(file, onProgress) {
  const variants = await buildOcrVariants(file);
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('jpn', 1);

  const texts = [];
  try {
    for (let i = 0; i < variants.length; i += 1) {
      const base = Math.round((i / variants.length) * 90);
      const text = await recognizeWithTesseract(variants[i], worker, (p) => {
        if (onProgress) onProgress(base + Math.round((p / 100) * (90 / variants.length)));
      });
      if (text) texts.push(text);
    }
    if (onProgress) onProgress(100);
    return mergeOcrTexts(texts);
  } finally {
    await worker.terminate();
  }
}
