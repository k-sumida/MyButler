import { NavLink, Outlet } from 'react-router-dom';
import './Layout.css';

export default function Layout({ user, onLogout }) {
  return (
    <div className="layout">
      <header className="header">
        <div className="header-brand">
          <span className="logo">🎩</span>
          <h1>MyButler</h1>
        </div>
        <nav className="nav">
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
            メモ
          </NavLink>
          <NavLink to="/subscriptions" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
            サブスク
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
            設定
          </NavLink>
        </nav>
        <div className="header-user">
          <span>{user.username}</span>
          <button className="btn-secondary" onClick={onLogout}>ログアウト</button>
        </div>
      </header>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
