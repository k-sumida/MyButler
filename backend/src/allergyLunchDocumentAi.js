let documentAiClient = null;

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
    return null;
  }
}

function getDocumentAiClient() {
  if (documentAiClient) return documentAiClient;
  const credentials = parseCredentials();
  if (!credentials) return null;

  // eslint-disable-next-line global-require
  const { DocumentProcessorServiceClient } = require('@google-cloud/documentai').v1;
  documentAiClient = new DocumentProcessorServiceClient({ credentials });
  return documentAiClient;
}

function getProcessorName() {
  const full = process.env.GOOGLE_DOCUMENT_AI_PROCESSOR;
  if (full) return full;

  const credentials = parseCredentials();
  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID || credentials?.project_id;
  const location = process.env.GOOGLE_DOCUMENT_AI_LOCATION || 'us';
  const processorId = process.env.GOOGLE_DOCUMENT_AI_PROCESSOR_ID;
  if (!projectId || !processorId) return null;

  return `projects/${projectId}/locations/${location}/processors/${processorId}`;
}

function extractBase64(imageDataUrl) {
  const match = String(imageDataUrl).match(/^data:image\/\w+;base64,(.+)$/);
  return match ? match[1] : imageDataUrl;
}

function getMimeType(imageDataUrl) {
  const match = String(imageDataUrl).match(/^data:(image\/\w+);base64,/);
  return match ? match[1] : 'image/jpeg';
}

function getTextFromAnchor(textAnchor, fullText) {
  if (!textAnchor?.textSegments?.length || !fullText) return '';
  let result = '';
  for (const segment of textAnchor.textSegments) {
    const start = Number(segment.startIndex || 0);
    const end = Number(segment.endIndex || 0);
    result += fullText.substring(start, end);
  }
  return result.replace(/\s+/g, ' ').trim();
}

function extractRowCells(row, fullText) {
  return (row.cells || []).map((cell) =>
    getTextFromAnchor(cell.layout?.textAnchor, fullText),
  );
}

function tableToGrid(table, fullText) {
  const headers = (table.headerRows || []).flatMap((row) => extractRowCells(row, fullText));
  const bodyRows = (table.bodyRows || []).map((row) => extractRowCells(row, fullText));

  if (!headers.length && !bodyRows.length) return null;

  const maxCols = Math.max(
    headers.length,
    ...bodyRows.map((r) => r.length),
    1,
  );

  const pad = (arr) => {
    const next = [...arr];
    while (next.length < maxCols) next.push('');
    return next.slice(0, maxCols);
  };

  return {
    headers: headers.length ? pad(headers) : [],
    rows: bodyRows.map(pad).filter((row) => row.some((cell) => cell.trim())),
  };
}

function extractTablesFromDocument(document) {
  const fullText = document.text || '';
  const tables = [];

  for (const page of document.pages || []) {
    for (const table of page.tables || []) {
      const grid = tableToGrid(table, fullText);
      if (grid && grid.rows.length) tables.push(grid);
    }
  }

  return tables;
}

/**
 * Document AI Layout Parser で表構造を抽出
 */
async function extractTablesWithDocumentAi(imageDataUrl) {
  const client = getDocumentAiClient();
  const processorName = getProcessorName();
  if (!client || !processorName) return null;

  const [result] = await client.processDocument({
    name: processorName,
    rawDocument: {
      content: extractBase64(imageDataUrl),
      mimeType: getMimeType(imageDataUrl),
    },
  });

  const tables = extractTablesFromDocument(result.document || {});
  if (!tables.length) return null;

  return { method: 'document-ai', tables };
}

module.exports = { extractTablesWithDocumentAi, extractTablesFromDocument };
