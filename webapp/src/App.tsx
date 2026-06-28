import { Link, NavLink, Navigate, Route, Routes } from "react-router-dom";
import RequireAuth from "./app/RequireAuth";
import { useApp } from "./app/AppContext";
import Wordmark from "./app/Wordmark";
import LoginPage from "./pages/LoginPage";
import LibraryPage from "./pages/LibraryPage";
import GuidePage from "./pages/GuidePage";
import GuideEditorPage from "./pages/GuideEditorPage";
import DriftPage from "./pages/DriftPage";
import SharePage from "./pages/SharePage";

const routes = (
  <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/share/:token" element={<SharePage />} />
    <Route path="/" element={<RequireAuth><LibraryPage /></RequireAuth>} />
    <Route path="/guides/:guideId" element={<RequireAuth><GuidePage /></RequireAuth>} />
    <Route path="/guides/:guideId/edit" element={<RequireAuth><GuideEditorPage /></RequireAuth>} />
    <Route path="/drift" element={<RequireAuth><DriftPage /></RequireAuth>} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);

function Sidebar() {
  const app = useApp();
  return (
    <aside className="sidebar">
      <Link to="/" className="wordmark">
        <Wordmark />
      </Link>
      <nav className="sidebar-nav">
        <NavLink to="/" end>
          Библиотека
        </NavLink>
        <NavLink to="/drift">Что устарело</NavLink>
      </nav>
      <div className="sidebar-foot">
        <button type="button" onClick={app.logout}>
          Выйти
        </button>
      </div>
    </aside>
  );
}

export default function App() {
  const app = useApp();
  if (!app.token) {
    // Logged-out: only /login and the public /share/:token render; both center themselves.
    return routes;
  }
  return (
    <div className="app">
      <Sidebar />
      <main className="app-main">{routes}</main>
    </div>
  );
}
