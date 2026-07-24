import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./AppShell";
import { TranslationsManagePage } from "./routes/TranslationsManagePage";
import { VersificationsManagePage } from "./routes/VersificationsManagePage";
import { ViewerPage } from "./routes/ViewerPage";

/**
 * Route tree for the SPA (router host is provided by ``main`` or tests).
 * Deep links rely on FastAPI's extensionless-path SPA fallback on refresh.
 */
export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<ViewerPage />} />
        <Route path="manage/translations" element={<TranslationsManagePage />} />
        <Route path="manage/versifications" element={<VersificationsManagePage />} />
        <Route path="manage" element={<Navigate to="/manage/translations" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
