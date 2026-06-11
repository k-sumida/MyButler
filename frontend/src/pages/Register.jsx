import { useState } from 'react';
import { Link } from 'react-router-dom';
import { auth } from '../api';
import './Auth.css';

export default function Register({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('パスワードが一致しません');
      return;
    }
    setLoading(true);
    try {
      const data = await auth.register(username, password);
      onLogin(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card card">
        <div className="auth-header">
          <span className="auth-logo">🎩</span>
          <h2>新規登録</h2>
          <p>MyButlerアカウントを作成</p>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>ユーザーID</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>パスワード（6文字以上）</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
          </div>
          <div className="form-group">
            <label>パスワード（確認）</label>
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </div>
          {error && <p className="error-msg">{error}</p>}
          <button type="submit" className="btn-primary auth-submit" disabled={loading}>
            {loading ? '登録中...' : '登録する'}
          </button>
        </form>
        <p className="auth-switch">
          既にアカウントをお持ちの方は <Link to="/login">ログイン</Link>
        </p>
      </div>
    </div>
  );
}
