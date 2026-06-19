import { NavLink, Outlet } from 'react-router-dom';
import './Layout.css';

const NAV_ITEMS = [
  { to: '/', end: true, label: 'メモ', icon: '📝', mobileLabel: 'メモ' },
  { to: '/allergy-lunch', label: 'アレルギー給食', icon: '🍱', mobileLabel: '給食' },
  { to: '/subscriptions', label: 'サブスク', icon: '💳', mobileLabel: 'サブスク' },
  { to: '/settings', label: '設定', icon: '⚙️', mobileLabel: '設定' },
];

export default function Layout({ user, onLogout }) {
  const initial = user.username?.charAt(0).toUpperCase() || '?';

  return (
    <div className="layout">
      <header className="header">
        <div className="header-brand">
          <span className="logo" aria-hidden="true">🎩</span>
          <h1 className="header-title">MyButler</h1>
        </div>

        <nav className="nav nav-desktop" aria-label="メインナビゲーション">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
            >
              <span className="nav-icon" aria-hidden="true">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="header-user">
          <div className="user-chip" title={user.username}>
            <span className="user-avatar">{initial}</span>
            <span className="user-name">{user.username}</span>
          </div>
          <button className="btn-ghost logout-btn" onClick={onLogout}>
            ログアウト
          </button>
        </div>
      </header>

      <main className="main">
        <div className="main-inner page-enter">
          <Outlet />
        </div>
      </main>

      <nav className="bottom-nav" aria-label="モバイルナビゲーション">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => (isActive ? 'bottom-nav-link active' : 'bottom-nav-link')}
          >
            <span className="bottom-nav-icon" aria-hidden="true">{item.icon}</span>
            <span className="bottom-nav-label">{item.mobileLabel}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
