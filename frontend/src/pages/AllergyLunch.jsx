import { useCallback, useEffect, useState } from 'react';
import { allergyLunch } from '../api';
import {
  currentYearMonth,
  formatYearMonthLabel,
  hasMenuTables,
  mergeMenuData,
  normalizeMenuData,
  parseMenuOcrText,
} from '../utils/allergyLunchParser';
import { buildOcrVariants, runOcrFromFile } from '../utils/ocr';
import './AllergyLunch.css';

const EMPTY_MENU = { tables: [] };

function buildMergedFromMonthData(monthData) {
  const parsedParts = (monthData.images || [])
    .filter((img) => img.parsed_data)
    .sort((a, b) => a.slot - b.slot)
    .map((img) => ({ ...img.parsed_data, slot: img.slot }));
  return parsedParts.length ? mergeMenuData(parsedParts) : EMPTY_MENU;
}

async function recognizeImage(file, yearMonth, onProgress) {
  const variants = await buildOcrVariants(file);

  try {
    const serverResult = await allergyLunch.ocr(variants[0], yearMonth);
    if (serverResult?.parsed_data?.tables?.length) {
      if (onProgress) onProgress(100);
      return {
        text: serverResult.text || '',
        parsed: serverResult.parsed_data,
        method: serverResult.method || 'server',
      };
    }
    if (serverResult?.text?.trim()) {
      const parsed = parseMenuOcrText(serverResult.text, yearMonth);
      if (parsed.tables?.length) {
        if (onProgress) onProgress(100);
        return { text: serverResult.text.trim(), parsed, method: serverResult.method || 'server' };
      }
    }
  } catch (err) {
    if (!err.fallback) {
      console.warn('Server OCR failed, falling back to browser OCR:', err.message);
    }
  }

  const text = await runOcrFromFile(file, onProgress);
  const parsed = parseMenuOcrText(text, yearMonth);
  return { text, parsed, method: 'tesseract' };
}

export default function AllergyLunch() {
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const [menuData, setMenuData] = useState(EMPTY_MENU);
  const [images, setImages] = useState([
    { slot: 1, has_data: false },
    { slot: 2, has_data: false },
  ]);
  const [loading, setLoading] = useState(true);
  const [processingSlot, setProcessingSlot] = useState(null);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [manualSlot, setManualSlot] = useState(null);
  const [manualText, setManualText] = useState('');

  const displayMenu = normalizeMenuData(menuData);

  const loadMonth = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await allergyLunch.get(yearMonth);
      setMenuData(normalizeMenuData(data.menu_data));
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

  const saveMonth = async (nextMenu) => {
    await allergyLunch.save(yearMonth, {
      user_allergens: [],
      menu_data: nextMenu,
    });
  };

  const applyParsedResult = async (slot, ocrText, parsed) => {
    await allergyLunch.saveImage(yearMonth, slot, { ocr_text: ocrText, parsed_data: parsed });

    const monthData = await allergyLunch.get(yearMonth);
    const merged = buildMergedFromMonthData(monthData);

    setMenuData(merged);
    await saveMonth(merged);

    const rowCount = merged.tables.reduce((sum, t) => sum + (t.rows?.length || 0), 0);
    setMessage(`写真${slot}を読み取りました（${rowCount}行）`);
    setManualSlot(null);
    setManualText('');
    await loadMonth();
  };

  const handleImageCapture = async (slot, file) => {
    if (!file) return;
    setProcessingSlot(slot);
    setOcrProgress(0);
    setError('');
    setMessage('');
    setManualSlot(null);

    try {
      const { text: ocrText, parsed } = await recognizeImage(file, yearMonth, setOcrProgress);

      if (!parsed?.tables?.length) {
        setManualSlot(slot);
        setManualText(ocrText);
        setError('表形式に整形できませんでした。下のテキストを確認・修正して「再解析」を押してください。');
        return;
      }

      await applyParsedResult(slot, ocrText, parsed);
    } catch (err) {
      setError(err.message || '画像の読み取りに失敗しました');
    } finally {
      setProcessingSlot(null);
      setOcrProgress(0);
    }
  };

  const handleManualParse = async () => {
    if (!manualSlot || !manualText.trim()) return;
    setProcessingSlot(manualSlot);
    setError('');
    setMessage('');

    try {
      const parsed = parseMenuOcrText(manualText, yearMonth);
      if (!parsed?.tables?.length) {
        throw new Error('献立を解析できませんでした。「3 火」のように日付と曜日が含まれているか確認してください。');
      }
      await applyParsedResult(manualSlot, manualText.trim(), parsed);
    } catch (err) {
      setError(err.message);
    } finally {
      setProcessingSlot(null);
    }
  };

  const openManualInput = (slot) => {
    const img = images.find((i) => i.slot === slot);
    setManualSlot(slot);
    setManualText(img?.ocr_text || '');
    setError('');
    setMessage('');
  };

  const handleDeleteSlot = async (slot) => {
    const img = images.find((i) => i.slot === slot);
    if (!img?.has_data) return;
    if (!window.confirm(`写真${slot}の読み取り結果を削除しますか？`)) return;

    setProcessingSlot(slot);
    setError('');
    setMessage('');
    if (manualSlot === slot) {
      setManualSlot(null);
      setManualText('');
    }

    try {
      const data = await allergyLunch.deleteImage(yearMonth, slot);
      const merged = normalizeMenuData(data.menu_data);
      setMenuData(merged);
      setImages(data.images || [{ slot: 1, has_data: false }, { slot: 2, has_data: false }]);
      await saveMonth(merged);
      setMessage(`写真${slot}の読み取り結果を削除しました`);
    } catch (err) {
      setError(err.message || '削除に失敗しました');
    } finally {
      setProcessingSlot(null);
    }
  };

  return (
    <div className="allergy-lunch">
      <div className="page-header">
        <h2>アレルギー給食管理</h2>
        <p>献立表を2枚（前半・後半）撮影して読み取り、表形式で表示します</p>
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
                <button
                  type="button"
                  className="capture-manual-btn"
                  disabled={!!processingSlot}
                  onClick={() => openManualInput(slot)}
                >
                  テキストを手入力
                </button>
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

        {manualSlot && (
          <div className="manual-ocr-panel">
            <h4>写真 {manualSlot} の読み取りテキスト</h4>
            <p className="settings-desc">
              OCR結果を確認・修正して再解析できます。行の先頭に「3 火」のように日付と曜日がある形式が読み取りやすいです。
            </p>
            <textarea
              className="manual-ocr-textarea"
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              rows={10}
              placeholder={'例:\n3 火\nごはん / 味噌汁 / ハンバーグ\n4 水\n...'}
            />
            <div className="manual-ocr-actions">
              <button
                type="button"
                className="capture-btn manual-parse-btn"
                disabled={!!processingSlot || !manualText.trim()}
                onClick={handleManualParse}
              >
                このテキストから再解析
              </button>
              <button
                type="button"
                className="capture-manual-btn"
                disabled={!!processingSlot}
                onClick={() => { setManualSlot(null); setManualText(''); setError(''); }}
              >
                閉じる
              </button>
            </div>
          </div>
        )}

        {message && <p className="success-msg">{message}</p>}
        {error && <p className="error-msg">{error}</p>}
      </div>

      {loading ? (
        <p className="loading-text">読み込み中...</p>
      ) : hasMenuTables(displayMenu) ? (
        displayMenu.tables.map((table, tableIdx) => (
          <div key={tableIdx} className="card menu-table-wrap">
            <h3>
              {formatYearMonthLabel(yearMonth)}の献立
              {displayMenu.tables.length > 1 ? `（${tableIdx + 1}）` : ''}
            </h3>
            <div className="menu-table-scroll">
              <table className="menu-table">
                {table.headers?.length > 0 && (
                  <thead>
                    <tr>
                      {table.headers.map((header, idx) => (
                        <th key={idx}>{header || `列${idx + 1}`}</th>
                      ))}
                    </tr>
                  </thead>
                )}
                <tbody>
                  {table.rows.map((row, rowIdx) => (
                    <tr key={rowIdx}>
                      {row.map((cell, cellIdx) => (
                        <td key={cellIdx} className={cellIdx >= 2 ? 'menu-cell' : ''}>
                          {cell || '-'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      ) : (
        <div className="empty-state card">
          <span className="empty-state-icon">🍱</span>
          <p>献立表の写真を撮影してください（前半・後半の2枚）</p>
        </div>
      )}
    </div>
  );
}
