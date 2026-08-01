import { APP_HEADER_END_ID } from "./lib/appHeaderSlot";
import { NavLink, Outlet } from "react-router-dom";
import { loadViewerSearch } from "./viewer/viewerPersistence";

/**
 * App chrome shared by viewer and manage routes.
 * Product name plus Viewer / Manage navigation; outlet renders the page.
 */
export function AppShell() {
  const storedViewerSearch = loadViewerSearch();

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">FRVT</div>
        <nav className="app-nav" aria-label="Primary">
          <NavLink to={storedViewerSearch ? `/?${storedViewerSearch}` : "/"} end>
            Viewer
          </NavLink>
          <NavLink to="/manage/translations">Translations</NavLink>
          <NavLink to="/manage/versifications">Versifications</NavLink>
        </nav>
        <div id={APP_HEADER_END_ID} className="app-header-end" />
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
