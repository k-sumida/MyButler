/** 学校給食で使われるアレルギー表示の標準物質 */
export const STANDARD_ALLERGENS = [
  'えび', 'かに', 'くるみ', '小麦', 'そば', '卵', '乳',
  'あわび', 'いか', 'いくら', 'オレンジ', 'カシューナッツ', 'キウイ', '牛肉',
  'ごま', 'さけ', 'さば', '大豆', '鶏肉', 'バナナ', '豚肉', 'まつたけ',
  'もも', 'やまいも', 'りんご', 'ゼラチン', '落花生', '杏仁',
];

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

function toHalfWidthDigits(text) {
  return (text || '').replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

function fixOcrTypos(text) {
  return toHalfWidthDigits(text)
    .replace(/[|｜]/g, '1')
    .replace(/(\d)\s*[OoＯｏ]\s*(\d)/g, '$1 0 $2')
    .replace(/([月火水木金土日])\s*[|｜l]\s/g, '$1 ');
}

function normalizeText(text) {
  return fixOcrTypos(text)
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/[　]/g, ' ')
    .replace(/[（(]/g, '(')
    .replace(/[）)]/g, ')')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function findAllergensInText(text) {
  const found = [];
  for (const allergen of STANDARD_ALLERGENS) {
    if (text.includes(allergen)) found.push(allergen);
  }
  return [...new Set(found)];
}

function extractLegendAllergens(text) {
  const legendMatch = text.match(/アレルギー原因食品等[^\n]*/);
  if (legendMatch) {
    return findAllergensInText(legendMatch[0]);
  }
  const idx = text.search(/アレルギー原因食品|アレルギー物質/);
  if (idx >= 0) {
    return findAllergensInText(text.slice(idx, idx + 400));
  }
  return findAllergensInText(text);
}

function extractAllergensFromMenuLine(line) {
  const fromMarkers = [];
  const parenMatches = line.matchAll(/[(\[（【]([^)）\]】]+)[)\]）】]/g);
  for (const match of parenMatches) {
    fromMarkers.push(...findAllergensInText(match[1]));
  }
  fromMarkers.push(...findAllergensInText(line));
  return [...new Set(fromMarkers)];
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
    let menu = cleanMenuText(menuSection.slice(start, end).replace(/\n+/g, ' / '));

    if (!isValidMenuLine(menu)) continue;

    seen.add(dayNum);
    const weekday = match[2] || WEEKDAYS[new Date(year, month - 1, dayNum).getDay()];
    days.push({
      day: dayNum,
      date: `${year}-${String(month).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`,
      weekday,
      menu,
      allergens: extractAllergensFromMenuLine(menu),
    });
  }

  return days;
}

function parseDayEntriesFromLines(lines, yearMonth) {
  const [year, month] = yearMonth.split('-').map(Number);
  const days = [];
  let currentDay = null;

  const dayStartPattern = /^(\d{1,2})\s*日?(?:\s*[（(]?\s*([月火水木金土日])\s*[）)]?)?/;
  const dayInlinePattern = /(?:^|\s)(\d{1,2})\s*日?\s*([月火水木金土日])(?=\s|$)/;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/アレルギー原因食品|栄養成分|熱量|カロリー|注意事項/.test(line)) break;

    const dayMatch = line.match(dayStartPattern);
    if (dayMatch) {
      const dayNum = Number(dayMatch[1]);
      if (dayNum >= 1 && dayNum <= 31) {
        const weekday = dayMatch[2] || WEEKDAYS[new Date(year, month - 1, dayNum).getDay()];
        const rest = line.replace(dayStartPattern, '').trim();
        currentDay = {
          day: dayNum,
          date: `${year}-${String(month).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`,
          weekday,
          menu: rest,
          allergens: extractAllergensFromMenuLine(line),
        };
        days.push(currentDay);
        continue;
      }
    }

    const inlineMatch = line.match(dayInlinePattern);
    if (inlineMatch && !dayMatch) {
      const dayNum = Number(inlineMatch[1]);
      if (dayNum >= 1 && dayNum <= 31) {
        const weekday = inlineMatch[2] || WEEKDAYS[new Date(year, month - 1, dayNum).getDay()];
        const rest = line.replace(dayInlinePattern, '').trim();
        currentDay = {
          day: dayNum,
          date: `${year}-${String(month).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`,
          weekday,
          menu: rest,
          allergens: extractAllergensFromMenuLine(line),
        };
        days.push(currentDay);
        continue;
      }
    }

    if (currentDay && isValidMenuLine(line)) {
      currentDay.menu = currentDay.menu ? `${currentDay.menu} / ${line}` : line;
      currentDay.allergens = [
        ...new Set([...currentDay.allergens, ...extractAllergensFromMenuLine(line)]),
      ];
    }
  }

  return days;
}

/**
 * OCRテキストから献立表データを抽出
 */
export function parseMenuOcrText(ocrText, yearMonth) {
  const normalized = normalizeText(ocrText);
  const lines = normalized.split('\n').map((l) => l.trim()).filter(Boolean);

  const legend_allergens = extractLegendAllergens(normalized);
  const blockDays = parseDayBlocks(normalized, yearMonth);
  const lineDays = parseDayEntriesFromLines(lines, yearMonth);
  const days = blockDays.length >= lineDays.length ? blockDays : lineDays;

  return { days, legend_allergens };
}

export function mergeMenuData(parts) {
  const legendSet = new Set();
  const dayMap = new Map();
  const sortedParts = [...parts]
    .filter(Boolean)
    .sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));

  for (const part of sortedParts) {
    (part.legend_allergens || []).forEach((a) => legendSet.add(a));
    (part.days || []).forEach((day) => {
      const key = day.date || String(day.day);
      dayMap.set(key, { ...day });
    });
  }

  const days = [...dayMap.values()].sort((a, b) => a.day - b.day);
  return {
    days,
    legend_allergens: [...legendSet],
  };
}

export function getHighlightAllergens(menuData, userAllergens) {
  const legend = menuData.legend_allergens || [];
  if (userAllergens?.length) {
    return userAllergens.filter((a) => legend.includes(a) || STANDARD_ALLERGENS.includes(a));
  }
  return legend;
}

export function isDayHighlighted(day, highlightAllergens) {
  if (!highlightAllergens.length) return false;
  return (day.allergens || []).some((a) => highlightAllergens.includes(a));
}

export function formatYearMonthLabel(yearMonth) {
  const [y, m] = yearMonth.split('-');
  return `${y}年${Number(m)}月`;
}

export function currentYearMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
