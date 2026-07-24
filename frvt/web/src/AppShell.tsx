import { NavLink, Outlet } from "react-router-dom";

/**
 * App chrome shared by viewer and manage routes.
 * Product name plus Viewer / Manage navigation; outlet renders the page.
 */
export function AppShell() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">FRVT</div>
        <nav className="app-nav" aria-label="Primary">
          <NavLink to="/" end>
            Viewer
          </NavLink>
          <NavLink to="/manage/translations">Translations</NavLink>
          <NavLink to="/manage/versifications">Versifications</NavLink>
        </nav>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
