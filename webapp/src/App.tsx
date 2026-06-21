import { Link, Route, Routes } from "react-router-dom";
import RequireAuth from "./app/RequireAuth";
import { useApp } from "./app/AppContext";
import LoginPage from "./pages/LoginPage";
import LibraryPage from "./pages/LibraryPage";
import GuidePage from "./pages/GuidePage";
import GuideEditorPage from "./pages/GuideEditorPage";
import DriftPage from "./pages/DriftPage";
import SharePage from "./pages/SharePage";

function Nav() {
  const app = useApp();
  if (!app.token) return null;
  return (
    <nav>
      <Link to="/">Библиотека</Link> <Link to="/drift">Что устарело</Link>{" "}
      <button type="button" onClick={app.logout}>
        Выйти
      </button>
    </nav>
  );
}

export default function App() {
  return (
    <div>
      <Nav />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/share/:token" element={<SharePage />} />
        <Route path="/" element={<RequireAuth><LibraryPage /></RequireAuth>} />
        <Route path="/guides/:guideId" element={<RequireAuth><GuidePage /></RequireAuth>} />
        <Route path="/guides/:guideId/edit" element={<RequireAuth><GuideEditorPage /></RequireAuth>} />
        <Route path="/drift" element={<RequireAuth><DriftPage /></RequireAuth>} />
      </Routes>
    </div>
  );
}
