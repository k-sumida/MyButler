const MIN_WIDTH = 2400;
const MAX_WIDTH = 3200;

function toHalfWidthDigits(text) {
  return text.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

function preprocessCanvas(ctx, width, height) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const { data } = imageData;
  let min = 255;
  let max = 0;

  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    data[i] = data[i + 1] = data[i + 2] = gray;
    if (gray < min) min = gray;
    if (gray > max) max = gray;
  }

  const range = Math.max(max - min, 1);
  const threshold = min + range * 0.55;

  for (let i = 0; i < data.length; i += 4) {
    const gray = data[i];
    const stretched = Math.min(255, Math.max(0, ((gray - min) / range) * 255));
    const binary = stretched > threshold ? 255 : 0;
    data[i] = data[i + 1] = data[i + 2] = binary;
    data[i + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);
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

/**
 * 画像をリサイズ・二値化して OCR 用の Data URL を返す
 */
export async function prepareImageForOcr(file) {
  const img = await loadImageFromFile(file);
  let width = img.width;
  let height = img.height;

  if (width < MIN_WIDTH) {
    const scale = MIN_WIDTH / width;
    width = MIN_WIDTH;
    height = Math.round(height * scale);
  } else if (width > MAX_WIDTH) {
    const scale = MAX_WIDTH / width;
    width = MAX_WIDTH;
    height = Math.round(height * scale);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.filter = 'contrast(1.2)';
  ctx.drawImage(img, 0, 0, width, height);
  preprocessCanvas(ctx, width, height);
  return canvas.toDataURL('image/png');
}

function scoreOcrText(text) {
  const normalized = toHalfWidthDigits(text || '');
  const japanese = (normalized.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/g) || []).length;
  const dayMarks = (normalized.match(/\d{1,2}\s*日?\s*[月火水木金土日]/g) || []).length;
  const garbage = (normalized.match(/[^\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\d\s/、。・（）()\-]/g) || []).length;
  return japanese + dayMarks * 15 - garbage * 2;
}

/**
 * Tesseract.js で日本語 OCR（無料・ブラウザ内処理）
 */
export async function runOcr(imageDataUrl, onProgress) {
  const { createWorker, PSM } = await import('tesseract.js');
  const worker = await createWorker('jpn', 1, {
    logger: (m) => {
      if (m.status === 'recognizing text' && onProgress) {
        onProgress(Math.round((m.progress || 0) * 100));
      }
    },
  });

  const modes = [PSM.SINGLE_BLOCK, PSM.SINGLE_COLUMN, PSM.SPARSE_TEXT];
  let bestText = '';
  let bestScore = -Infinity;

  try {
    await worker.setParameters({
      preserve_interword_spaces: '1',
    });

    for (let i = 0; i < modes.length; i += 1) {
      const mode = modes[i];
      if (onProgress) {
        onProgress(Math.round((i / modes.length) * 100));
      }
      await worker.setParameters({ tessedit_pageseg_mode: mode });
      const { data } = await worker.recognize(imageDataUrl);
      const text = toHalfWidthDigits(data.text || '');
      const score = scoreOcrText(text);
      if (score > bestScore) {
        bestScore = score;
        bestText = text;
      }
    }

    if (onProgress) onProgress(100);
    return bestText.trim();
  } finally {
    await worker.terminate();
  }
}
