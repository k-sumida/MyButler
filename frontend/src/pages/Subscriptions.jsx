import { useState, useEffect } from 'react';
import { subscriptions as subsApi } from '../api';
import './Subscriptions.css';

const CATEGORIES = ['音楽配信', '動画配信', 'ゲーム', 'クラウドストレージ', '生産性', 'AI', 'スポーツ配信', 'その他'];

const SAMPLE_TRANSACTIONS = [
  { description: 'NETFLIX.COM 月額', amount: 1490 },
  { description: 'Spotify Premium', amount: 980 },
  { description: 'Apple.com/bill Apple Music', amount: 1080 },
  { description: 'GOOGLE *YouTube Premium', amount: 1280 },
  { description: 'Amazon Prime会費', amount: 600 },
];

export default function Subscriptions() {
  const [subs, setSubs] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    service_name: '',
    category: '動画配信',
    billing_cycle: 'monthly',
    amount: '',
    renewal_date: '',
    notes: '',
  });

  const load = async () => {
    try {
      const data = await subsApi.list();
      setSubs(data.subscriptions);
      setSummary(data.summary);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await subsApi.create({ ...form, amount: parseFloat(form.amount) });
      setForm({ service_name: '', category: '動画配信', billing_cycle: 'monthly', amount: '', renewal_date: '', notes: '' });
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDetect = async () => {
    setDetecting(true);
    setError('');
    setMessage('');
    try {
      const data = await subsApi.detect(SAMPLE_TRANSACTIONS);
      setMessage(data.message);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setDetecting(false);
    }
  };

  const handleToggle = async (sub) => {
    await subsApi.update(sub.id, { is_active: !sub.is_active });
    load();
  };

  const handleDelete = async (id) => {
    if (!confirm('このサブスクリプションを削除しますか？')) return;
    await subsApi.delete(id);
    load();
  };

  const formatCurrency = (amount) => `¥${amount.toLocaleString()}`;

  return (
    <div className="subscriptions">
      <div className="page-header">
        <h2>サブスクリプション管理</h2>
        <p>音楽・動画配信サービス等のサブスクを一覧で管理できます</p>
      </div>

      {summary && (
        <div className="summary-grid">
          <div className="summary-card card">
            <span className="summary-label">月額合計</span>
            <span className="summary-value">{formatCurrency(summary.monthly_total)}</span>
          </div>
          <div className="summary-card card">
            <span className="summary-label">年額合計</span>
            <span className="summary-value">{formatCurrency(summary.yearly_total)}</span>
          </div>
          <div className="summary-card card highlight">
            <span className="summary-label">月あたり換算</span>
            <span className="summary-value">{formatCurrency(Math.round(summary.monthly_equivalent))}</span>
          </div>
          <div className="summary-card card">
            <span className="summary-label">有効なサブスク</span>
            <span className="summary-value">{summary.active_count}件</span>
          </div>
        </div>
      )}

      <div className="action-bar">
        <button className="btn-accent" onClick={handleDetect} disabled={detecting}>
          {detecting ? '検出中...' : '🔍 サブスク自動検出（デモ）'}
        </button>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? '閉じる' : '+ 手動追加'}
        </button>
      </div>

      {message && <p className="success-msg">{message}</p>}
      {error && <p className="error-msg">{error}</p>}

      {showForm && (
        <form className="sub-form card" onSubmit={handleCreate}>
          <div className="form-row">
            <div className="form-group">
              <label>サービス名</label>
              <input value={form.service_name} onChange={(e) => setForm({ ...form, service_name: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>カテゴリ</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>会費</label>
              <input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required min="0" />
            </div>
            <div className="form-group">
              <label>課金サイクル</label>
              <select value={form.billing_cycle} onChange={(e) => setForm({ ...form, billing_cycle: e.target.value })}>
                <option value="monthly">月額</option>
                <option value="yearly">年額</option>
              </select>
            </div>
            <div className="form-group">
              <label>更新日</label>
              <input type="date" value={form.renewal_date} onChange={(e) => setForm({ ...form, renewal_date: e.target.value })} required />
            </div>
          </div>
          <button type="submit" className="btn-primary">登録</button>
        </form>
      )}

      {loading ? (
        <p className="loading-text">読み込み中...</p>
      ) : subs.length === 0 ? (
        <div className="empty-state card">
          <span className="empty-state-icon">📱</span>
          <p>サブスクリプションが登録されていません。<br />自動検出または手動で追加してください。</p>
        </div>
      ) : (
        <div className="sub-list">
          {subs.map((sub) => (
            <div key={sub.id} className={`sub-card card ${!sub.is_active ? 'inactive' : ''}`}>
              <div className="sub-header">
                <div>
                  <h3>{sub.service_name}</h3>
                  <span className="sub-category">{sub.category}</span>
                </div>
                <div className="sub-badges">
                  {sub.auto_detected ? <span className="badge badge-auto">自動検出</span> : null}
                  <span className={`badge ${sub.is_active ? 'badge-active' : 'badge-inactive'}`}>
                    {sub.is_active ? '有効' : '無効'}
                  </span>
                </div>
              </div>
              <div className="sub-details">
                <div className="sub-detail">
                  <span className="detail-label">会費</span>
                  <span className="detail-value">
                    {formatCurrency(sub.amount)} / {sub.billing_cycle === 'monthly' ? '月' : '年'}
                  </span>
                </div>
                <div className="sub-detail">
                  <span className="detail-label">更新日</span>
                  <span className="detail-value">{sub.renewal_date}</span>
                </div>
              </div>
              {sub.notes && <p className="sub-notes">{sub.notes}</p>}
              <div className="sub-actions">
                <button className="btn-secondary" onClick={() => handleToggle(sub)}>
                  {sub.is_active ? '無効化' : '有効化'}
                </button>
                <button className="btn-danger" onClick={() => handleDelete(sub.id)}>削除</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
