const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

function toHalfWidthDigits(text) {
  return (text || '').replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

function normalizeText(text) {
  return toHalfWidthDigits(text)
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/[　]/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cleanMenuText(menu) {
  return menu
    .replace(/アレルギー原因食品[\s\S]*$/g, '')
    .replace(/栄養成分|熱量|カロリー|注意事項[\s\S]*$/g, '')
    .replace(/^[\s/、。]+|[\s/、。]+$/g, '')
    .trim();
}

function isValidMenuLine(line) {
  if (!line || line.length < 2) return false;
  if (/^[0-9\s/.、-]+$/.test(line)) return false;
  if (/^(月|火|水|木|金|土|日)$/.test(line)) return false;
  return true;
}

function parseDayBlocks(text, yearMonth) {
  const [year, month] = yearMonth.split('-').map(Number);
  const menuSection = text.split(/アレルギー原因食品/)[0];
  const dayPattern = /(\d{1,2})\s*日?\s*([月火水木金土日])/g;
  const matches = [...menuSection.matchAll(dayPattern)];

  const days = [];
  const seen = new Set();

  for (let i = 0; i < matches.length; i += 1) {
    const match = matches[i];
    const dayNum = Number(match[1]);
    if (dayNum < 1 || dayNum > 31 || seen.has(dayNum)) continue;

    const start = match.index + match[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : menuSection.length;
    const menu = cleanMenuText(menuSection.slice(start, end).replace(/\n+/g, ' / '));

    if (!isValidMenuLine(menu)) continue;

    seen.add(dayNum);
    days.push({
      day: dayNum,
      weekday: match[2] || WEEKDAYS[new Date(year, month - 1, dayNum).getDay()],
      menu,
    });
  }

  return days;
}

function daysToTable(days) {
  return {
    headers: ['日', '曜', '献立'],
    rows: days.map((d) => [String(d.day), d.weekday || '', d.menu || '']),
  };
}

function textToTableFallback(ocrText, yearMonth) {
  const normalized = normalizeText(ocrText);
  const days = parseDayBlocks(normalized, yearMonth);
  if (!days.length) return { tables: [] };
  return { tables: [daysToTable(days)] };
}

module.exports = { textToTableFallback, daysToTable };
