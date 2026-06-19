import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './CalendarPopover.css';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const MOBILE_MQ = '(max-width: 640px)';

function pad(n) {
  return String(n).padStart(2, '0');
}

function toDateString(year, month, day) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function parseDate(value) {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function formatDisplayDate(date) {
  if (!date) return '';
  const parsed = parseDate(date);
  if (!parsed) return date;
  return `${parsed.getFullYear()}/${pad(parsed.getMonth() + 1)}/${pad(parsed.getDate())}`;
}

function useMobileSheet() {
  const [mobileSheet, setMobileSheet] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(MOBILE_MQ).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_MQ);
    const update = () => setMobileSheet(mq.matches);
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  return mobileSheet;
}

export default function CalendarPopover({
  date,
  time,
  onDateChange,
  onTimeChange,
  onClear,
  minDate,
  placeholder = '日付を選択',
  showTime = false,
  allowClear = false,
}) {
  const selected = parseDate(date);
  const min = parseDate(minDate) || new Date();
  const wrapperRef = useRef(null);
  const mobileSheet = useMobileSheet();

  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState('below');
  const [viewYear, setViewYear] = useState(selected?.getFullYear() ?? min.getFullYear());
  const [viewMonth, setViewMonth] = useState((selected?.getMonth() ?? min.getMonth()) + 1);

  useEffect(() => {
    if (!open || mobileSheet) return undefined;
    const handleClickOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, mobileSheet]);

  useEffect(() => {
    if (!open) return undefined;

    if (mobileSheet) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }

    const updatePlacement = () => {
      const rect = wrapperRef.current?.getBoundingClientRect();
      if (!rect) return;
      const spaceBelow = window.innerHeight - rect.bottom;
      setPlacement(spaceBelow < 360 ? 'above' : 'below');
    };

    updatePlacement();
    window.addEventListener('resize', updatePlacement);
    return () => window.removeEventListener('resize', updatePlacement);
  }, [open, mobileSheet]);

  useEffect(() => {
    if (!open || !wrapperRef.current) return;
    wrapperRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [open]);

  useEffect(() => {
    if (selected) {
      setViewYear(selected.getFullYear());
      setViewMonth(selected.getMonth() + 1);
    }
  }, [date]);

  const calendarDays = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth - 1, 1);
    const startOffset = firstDay.getDay();
    const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
    const cells = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let day = 1; day <= daysInMonth; day++) cells.push(day);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [viewYear, viewMonth]);

  const goMonth = (delta) => {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    setViewMonth(m);
    setViewYear(y);
  };

  const isDisabled = (day) => {
    const cellDate = new Date(viewYear, viewMonth - 1, day);
    const minStart = new Date(min.getFullYear(), min.getMonth(), min.getDate());
    return cellDate < minStart;
  };

  const isSelected = (day) =>
    selected &&
    selected.getFullYear() === viewYear &&
    selected.getMonth() + 1 === viewMonth &&
    selected.getDate() === day;

  const isToday = (day) => {
    const today = new Date();
    return today.getFullYear() === viewYear && today.getMonth() + 1 === viewMonth && today.getDate() === day;
  };

  const handleSelectDay = (day) => {
    if (isDisabled(day)) return;
    onDateChange(toDateString(viewYear, viewMonth, day));
    if (!showTime) setOpen(false);
  };

  const displayValue = date
    ? `${formatDisplayDate(date)}${showTime && time ? ` ${time}` : ''}`
    : '';

  const popover = open ? (
  <div
    className={[
      'calendar-popover',
      mobileSheet ? 'calendar-popover--sheet' : '',
      !mobileSheet && placement === 'above' ? 'calendar-popover--above' : '',
    ].filter(Boolean).join(' ')}
    role="dialog"
    aria-label="日付選択"
  >
    <div className="calendar-header">
      <button type="button" className="calendar-nav" onClick={() => goMonth(-1)} aria-label="前月">‹</button>
      <span className="calendar-title">{viewYear}年{viewMonth}月</span>
      <button type="button" className="calendar-nav" onClick={() => goMonth(1)} aria-label="翌月">›</button>
    </div>

    <div className="calendar-weekdays">
      {WEEKDAYS.map((w) => (
        <span key={w} className="calendar-weekday">{w}</span>
      ))}
    </div>

    <div className="calendar-grid">
      {calendarDays.map((day, i) => (
        <button
          key={i}
          type="button"
          className={[
            'calendar-day',
            day ? '' : 'empty',
            day && isSelected(day) ? 'selected' : '',
            day && isToday(day) ? 'today' : '',
            day && isDisabled(day) ? 'disabled' : '',
          ].filter(Boolean).join(' ')}
          onClick={() => day && handleSelectDay(day)}
          disabled={!day || isDisabled(day)}
        >
          {day || ''}
        </button>
      ))}
    </div>

    {showTime && (
      <div className="popover-time">
        <label>時刻</label>
        <input
          type="time"
          value={time || '09:00'}
          onChange={(e) => onTimeChange(e.target.value)}
        />
      </div>
    )}

    <div className="popover-actions">
      {allowClear && date && (
        <button
          type="button"
          className="btn-secondary popover-clear"
          onClick={() => { onClear?.(); setOpen(false); }}
        >
          クリア
        </button>
      )}
      <button type="button" className="btn-primary popover-done" onClick={() => setOpen(false)}>
        完了
      </button>
    </div>
  </div>
  ) : null;

  return (
    <div className="calendar-popover-wrap" ref={wrapperRef}>
      <button
        type="button"
        className={`calendar-trigger ${open ? 'open' : ''} ${displayValue ? 'has-value' : ''}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="calendar-trigger-icon">📅</span>
        <span className="calendar-trigger-text">
          {displayValue || placeholder}
        </span>
        <span className="calendar-trigger-arrow">{open ? '▲' : '▼'}</span>
      </button>

      {open && mobileSheet && createPortal(
        <button
          type="button"
          className="calendar-backdrop"
          aria-label="カレンダーを閉じる"
          onClick={() => setOpen(false)}
        />,
        document.body,
      )}

      {mobileSheet && open
        ? createPortal(popover, document.body)
        : popover}
    </div>
  );
}
