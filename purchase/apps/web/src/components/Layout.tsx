import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { useAuth, useLogout } from '../auth/auth';
import { ROLE_TEXT } from '../lib/format';
import { GlobalSearch } from './GlobalSearch';
import { useTheme } from './theme';
import { useToast } from './toast';

const THEME_TEXT = { system: 'Тема: як у системі', light: 'Тема: світла', dark: 'Тема: темна' };
const THEME_ICON = { system: '◐', light: '☀', dark: '☾' };

/** Каркас застосунку: бічне меню (на телефоні — висувне), верхня панель з пошуком і користувачем. */
export function Layout() {
  const { me, canEdit, isAdmin } = useAuth();
  const logout = useLogout();
  const { theme, cycle } = useTheme();
  const location = useLocation();
  const toast = useToast();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => setMenuOpen(false), [location.pathname]);

  // Повідомлення, передане через navigate(..., { state: { flash } }) — показуємо тостом.
  const flash = (location.state as { flash?: string } | null)?.flash;
  useEffect(() => {
    if (flash) {
      toast.ok(flash);
      window.history.replaceState({ ...window.history.state, usr: null }, '');
    }
  }, [location.key, flash, toast]);

  // Перехід до якоря (#delivery-12) після завантаження сторінки.
  useEffect(() => {
    if (!location.hash) return;
    const t = setTimeout(() => {
      const el = document.getElementById(location.hash.slice(1));
      if (el) {
        el.scrollIntoView({ block: 'center' });
        el.classList.add('flash-row');
        setTimeout(() => el.classList.remove('flash-row'), 2000);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [location.hash, location.key]);

  return (
    <div className={`shell${menuOpen ? ' menu-open' : ''}`}>
      <a href="#main" className="skip">До змісту</a>
      <aside className="sidebar" aria-label="Розділи">
        <Link to="/contracts" className="brand">
          <span className="brand-mark" aria-hidden>₴</span>
          <span>Облік закупівель<small>договори та поставки</small></span>
        </Link>
        <nav className="side-nav">
          <NavLink to="/contracts" end>📄 Договори</NavLink>
          {canEdit && <NavLink to="/contracts/new">＋ Новий договір</NavLink>}
          <NavLink to="/search">🔍 Пошук</NavLink>
          <NavLink to="/analytics">📊 Аналітика</NavLink>
          {isAdmin && (
            <>
              <div className="side-sep">Адміністрування</div>
              <NavLink to="/admin/users">👥 Користувачі</NavLink>
              <NavLink to="/admin/audit">🧾 Журнал дій</NavLink>
            </>
          )}
        </nav>
      </aside>
      <div className="backdrop" onClick={() => setMenuOpen(false)} aria-hidden />

      <div className="main-col">
        <header className="topbar">
          <button type="button" className="btn ghost menu-btn" aria-label="Меню" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>☰</button>
          <GlobalSearch />
          <div className="topbar-right">
            <button type="button" className="btn ghost" onClick={cycle} title={THEME_TEXT[theme]} aria-label={THEME_TEXT[theme]}>
              {THEME_ICON[theme]}
            </button>
            {me && (
              <details className="user-menu">
                <summary>
                  <span className="avatar" aria-hidden>{me.fullName.slice(0, 1).toUpperCase()}</span>
                  <span className="user-name">{me.fullName}</span>
                </summary>
                <div className="user-pop">
                  <div className="small muted">{me.login} · {ROLE_TEXT[me.role]}</div>
                  <Link to="/account" className="btn sm">Змінити пароль</Link>
                  <button type="button" className="btn sm" onClick={() => void logout()}>Вийти</button>
                </div>
              </details>
            )}
          </div>
        </header>
        <main id="main" className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
