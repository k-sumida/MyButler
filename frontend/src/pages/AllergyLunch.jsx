import { useCallback, useEffect, useMemo, useState } from 'react';
import { allergyLunch } from '../api';
import {
  STANDARD_ALLERGENS,
  currentYearMonth,
  formatYearMonthLabel,
  getHighlightAllergens,
  isDayHighlighted,
  mergeMenuData,
  parseMenuOcrText,
} from '../utils/allergyLunchParser';
import { prepareImageForOcr, runOcr } from '../utils/ocr';
import './AllergyLunch.css';

const EMPTY_MENU = { days: [], legend_allergens: [] };

function formatMenuItems(menu) {
  if (!menu) return [];
  return String(menu)
    .split(/[/／\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildMergedFromMonthData(monthData) {
  const parsedParts = (monthData.images || [])
    .filter((img) => img.parsed_data)
    .sort((a, b) => a.slot - b.slot)
    .map((img) => ({ ...img.parsed_data, slot: img.slot }));
  return parsedParts.length ? mergeMenuData(parsedParts) : EMPTY_MENU;
}

export default function AllergyLunch() {
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const [menuData, setMenuData] = useState(EMPTY_MENU);
  const [userAllergens, setUserAllergens] = useState([]);
  const [images, setImages] = useState([
    { slot: 1, has_data: false },
    { slot: 2, has_data: false },
  ]);
  const [loading, setLoading] = useState(true);
  const [processingSlot, setProcessingSlot] = useState(null);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const highlightAllergens = useMemo(
    () => getHighlightAllergens(menuData, userAllergens),
    [menuData, userAllergens],
  );

  const loadMonth = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await allergyLunch.get(yearMonth);
      setMenuData(data.menu_data || EMPTY_MENU);
      setUserAllergens(data.user_allergens?.length
        ? data.user_allergens
        : data.menu_data?.legend_allergens || []);
      setImages(data.images || [{ slot: 1, has_data: false }, { slot: 2, has_data: false }]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [yearMonth]);

  useEffect(() => {
    loadMonth();
  }, [loadMonth]);

  const saveMonth = async (nextMenu, nextAllergens = userAllergens) => {
    await allergyLunch.save(yearMonth, {
      user_allergens: nextAllergens,
      menu_data: nextMenu,
    });
  };

  const handleImageCapture = async (slot, file) => {
    if (!file) return;
    setProcessingSlot(slot);
    setOcrProgress(0);
    setError('');
    setMessage('');

    try {
      const imageDataUrl = await prepareImageForOcr(file);
      const ocrText = await runOcr(imageDataUrl, setOcrProgress);
      const parsed = parseMenuOcrText(ocrText, yearMonth);

      if (!parsed?.days?.length) {
        throw new Error('献立を読み取れませんでした。明るい場所で表全体が写るように撮り直してください。');
      }

      await allergyLunch.saveImage(yearMonth, slot, { ocr_text: ocrText, parsed_data: parsed });

      const monthData = await allergyLunch.get(yearMonth);
      const merged = buildMergedFromMonthData(monthData);
      const nextAllergens = userAllergens.length ? userAllergens : merged.legend_allergens;

      setMenuData(merged);
      setUserAllergens(nextAllergens);
      await saveMonth(merged, nextAllergens);

      setMessage(`写真${slot}を読み取りました（合計${merged.days.length}日分）`);
      await loadMonth();
    } catch (err) {
      setError(err.message || '画像の読み取りに失敗しました');
    } finally {
      setProcessingSlot(null);
      setOcrProgress(0);
    }
  };

  const handleDeleteSlot = async (slot) => {
    const img = images.find((i) => i.slot === slot);
    if (!img?.has_data) return;
    if (!window.confirm(`写真${slot}の読み取り結果を削除しますか？`)) return;

    setProcessingSlot(slot);
    setError('');
    setMessage('');

    try {
      const data = await allergyLunch.deleteImage(yearMonth, slot);
      const merged = data.menu_data || EMPTY_MENU;
      setMenuData(merged);
      setImages(data.images || [{ slot: 1, has_data: false }, { slot: 2, has_data: false }]);
      if (!merged.legend_allergens?.length) {
        setUserAllergens([]);
        await saveMonth(merged, []);
      } else {
        const nextAllergens = userAllergens.filter((a) => merged.legend_allergens.includes(a));
        setUserAllergens(nextAllergens);
        await saveMonth(merged, nextAllergens);
      }
      setMessage(`写真${slot}の読み取り結果を削除しました`);
    } catch (err) {
      setError(err.message || '削除に失敗しました');
    } finally {
      setProcessingSlot(null);
    }
  };

  const toggleAllergen = async (allergen) => {
    const next = userAllergens.includes(allergen)
      ? userAllergens.filter((a) => a !== allergen)
      : [...userAllergens, allergen];
    setUserAllergens(next);
    try {
      await saveMonth(menuData, next);
    } catch (err) {
      setError(err.message);
    }
  };

  const legendAllergens = menuData.legend_allergens || [];
  const allergenOptions = [...new Set([...legendAllergens, ...STANDARD_ALLERGENS])];

  return (
    <div className="allergy-lunch">
      <div className="page-header">
        <h2>アレルギー給食管理</h2>
        <p>献立表を2枚（前半・後半）撮影してOCRで読み取り、アレルギー物質を強調表示します</p>
      </div>

      <div className="card allergy-controls">
        <div className="form-group">
          <label>対象月</label>
          <input
            type="month"
            value={yearMonth}
            onChange={(e) => setYearMonth(e.target.value)}
          />
        </div>

        <div className="capture-grid">
          {[1, 2].map((slot) => {
            const img = images.find((i) => i.slot === slot);
            const isProcessing = processingSlot === slot;
            return (
              <div key={slot} className="capture-slot card">
                <h4>写真 {slot}</h4>
                <p className="capture-hint">
                  {img?.has_data ? '読み取り済み' : '未登録'}
                  {yearMonth && `（${formatYearMonthLabel(yearMonth)}）`}
                </p>
                <label className={`capture-btn ${isProcessing ? 'disabled' : ''}`}>
                  {isProcessing ? `読み取り中… ${ocrProgress}%` : 'カメラで撮影'}
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    disabled={!!processingSlot}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      handleImageCapture(slot, file);
                      e.target.value = '';
                    }}
                  />
                </label>
                {img?.has_data && (
                  <button
                    type="button"
                    className="btn-danger capture-delete-btn"
                    disabled={!!processingSlot}
                    onClick={() => handleDeleteSlot(slot)}
                  >
                    読み取り結果を削除
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {message && <p className="success-msg">{message}</p>}
        {error && <p className="error-msg">{error}</p>}
      </div>

      {legendAllergens.length > 0 && (
        <div className="card allergy-legend-panel">
          <h3>読み取ったアレルギー物質</h3>
          <p className="settings-desc">強調表示する物質を選択してください</p>
          <div className="allergen-chips">
            {allergenOptions.filter((a) => legendAllergens.includes(a)).map((allergen) => (
              <button
                key={allergen}
                type="button"
                className={`allergen-chip ${userAllergens.includes(allergen) ? 'active' : ''}`}
                onClick={() => toggleAllergen(allergen)}
              >
                {allergen}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <p className="loading-text">読み込み中...</p>
      ) : menuData.days?.length > 0 ? (
        <div className="card menu-table-wrap">
          <h3>{formatYearMonthLabel(yearMonth)}の献立</h3>
          <div className="menu-table-scroll">
            <table className="menu-table">
              <thead>
                <tr>
                  <th>日</th>
                  <th>曜</th>
                  <th>献立</th>
                  <th>アレルギー</th>
                </tr>
              </thead>
              <tbody>
                {menuData.days.map((day) => {
                  const highlighted = isDayHighlighted(day, highlightAllergens);
                  return (
                    <tr key={day.date || day.day} className={highlighted ? 'row-alert' : ''}>
                      <td className={highlighted ? 'cell-alert' : ''}>{day.day}</td>
                      <td>{day.weekday || '-'}</td>
                      <td className="menu-cell">
                        {formatMenuItems(day.menu).length > 0 ? (
                          formatMenuItems(day.menu).map((item, idx) => (
                            <span key={idx} className="menu-item">{item}</span>
                          ))
                        ) : (
                          '-'
                        )}
                      </td>
                      <td>
                        <div className="allergen-tags">
                          {(day.allergens || []).map((a) => (
                            <span
                              key={a}
                              className={`allergen-tag ${highlightAllergens.includes(a) ? 'tag-alert' : ''}`}
                            >
                              {a}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="empty-state card">
          <span className="empty-state-icon">🍱</span>
          <p>献立表の写真を撮影してください（前半・後半の2枚）</p>
        </div>
      )}
    </div>
  );
}
