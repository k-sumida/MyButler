/** 学校給食で使われるアレルギー表示の標準物質 */
export const STANDARD_ALLERGENS = [
  'えび', 'かに', 'くるみ', '小麦', 'そば', '卵', '乳',
  'あわび', 'いか', 'いくら', 'オレンジ', 'カシューナッツ', 'キウイ', '牛肉',
  'ごま', 'さけ', 'さば', '大豆', '鶏肉', 'バナナ', '豚肉', 'まつたけ',
  'もも', 'やまいも', 'りんご', 'ゼラチン', '落花生', '杏仁',
];

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

function normalizeText(text) {
  return (text || '')
    .replace(/\r/g, '\n')
    .replace(/[　\s]+/g, ' ')
    .replace(/[（(]/g, '(')
    .replace(/[）)]/g, ')')
    .trim();
}

function findAllergensInText(text) {
  const found = [];
  for (const allergen of STANDARD_ALLERGENS) {
    if (text.includes(allergen)) found.push(allergen);
  }
  return [...new Set(found)];
}

function extractLegendAllergens(lines) {
  const legendStart = lines.findIndex((line) =>
    /アレルギー原因食品/.test(line) || /アレルギー物質/.test(line),
  );
  if (legendStart === -1) {
    return findAllergensInText(lines.join('\n'));
  }

  const legendLines = lines.slice(legendStart, legendStart + 20);
  return findAllergensInText(legendLines.join('\n'));
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

function parseDayEntries(lines, yearMonth) {
  const [year, month] = yearMonth.split('-').map(Number);
  const days = [];
  let currentDay = null;

  const dayStartPattern = /^(\d{1,2})\s*日?(?:\s*[（(]?\s*([月火水木金土日])\s*[）)]?)?/;
  const menuKeywords = /献立|主菜|副菜|汁物|麺|パン|カレー|丼/;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/アレルギー原因食品|栄養成分|熱量|カロリー|注意事項/.test(line)) break;

    const dayMatch = line.match(dayStartPattern);
    if (dayMatch) {
      const dayNum = Number(dayMatch[1]);
      if (dayNum >= 1 && dayNum <= 31) {
        const date = new Date(year, month - 1, dayNum);
        const weekday = dayMatch[2] || WEEKDAYS[date.getDay()];
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

    if (currentDay && line.length > 1 && !/^[0-9０-９\s]+$/.test(line)) {
      if (menuKeywords.test(line) || line.length >= 3) {
        currentDay.menu = currentDay.menu ? `${currentDay.menu} / ${line}` : line;
        currentDay.allergens = [
          ...new Set([...currentDay.allergens, ...extractAllergensFromMenuLine(line)]),
        ];
      }
    }
  }

  return days;
}

/**
 * OCRテキストから献立表データを抽出
 * @param {string} ocrText
 * @param {string} yearMonth - YYYY-MM
 */
export function parseMenuOcrText(ocrText, yearMonth) {
  const normalized = normalizeText(ocrText);
  const lines = normalized.split('\n').map((l) => l.trim()).filter(Boolean);

  const legend_allergens = extractLegendAllergens(lines);
  const menuLines = lines.filter((line) => !/アレルギー原因食品等/.test(line));
  const days = parseDayEntries(menuLines, yearMonth);

  return { days, legend_allergens };
}

export function mergeMenuData(parts) {
  const legendSet = new Set();
  const dayMap = new Map();

  for (const part of parts) {
    if (!part) continue;
    (part.legend_allergens || []).forEach((a) => legendSet.add(a));
    (part.days || []).forEach((day) => {
      const key = day.date || String(day.day);
      const existing = dayMap.get(key);
      if (!existing) {
        dayMap.set(key, { ...day });
        return;
      }
      dayMap.set(key, {
        ...existing,
        menu: [existing.menu, day.menu].filter(Boolean).join(' / '),
        allergens: [...new Set([...(existing.allergens || []), ...(day.allergens || [])])],
      });
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
