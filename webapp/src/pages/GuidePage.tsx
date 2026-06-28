import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useApp } from "../app/AppContext";
import type { GuideDetail, VersionSummary } from "../lib/types";

export default function GuidePage() {
  const app = useApp();
  const { guideId } = useParams();
  const [guide, setGuide] = useState<GuideDetail | null>(null);
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [flagged, setFlagged] = useState<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    async function load() {
      if (!app.token || !app.orgId || !guideId) return;
      const g = await app.api.getGuide(app.token, app.orgId, guideId);
      const v = await app.api.listVersions(app.token, app.orgId, guideId);
      if (active) {
        setGuide(g);
        setVersions(v);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [app, guideId]);

  async function makeLink() {
    if (!app.token || !app.orgId || !guideId) return;
    const link = await app.api.createShareLink(app.token, app.orgId, guideId);
    setShareUrl(link.url_path);
  }

  async function flag(stepId: string) {
    if (!app.token || !app.orgId) return;
    await app.api.flagDrift(app.token, app.orgId, stepId);
    setFlagged((prev) => new Set(prev).add(stepId));
  }

  if (!guide) return <p className="loading">Загрузка…</p>;

  return (
    <div className="page">
      <div className="page-head">
        <p className="eyebrow">Регламент</p>
        <h1>{guide.title}</h1>
        <div className="btn-row" style={{ marginTop: 12 }}>
          <span className="vchip">Версия {guide.version_number}</span>
        </div>
      </div>

      <ol className="steps">
        {guide.steps.map((s) => (
          <li key={s.id}>
            <div className="step-body">{s.text}</div>
            {flagged.has(s.id) ? (
              <span className="step-flagged">Помечено как устаревший</span>
            ) : (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => flag(s.id)}>
                этого больше нет
              </button>
            )}
          </li>
        ))}
      </ol>

      <div className="btn-row">
        <Link className="btn btn-ghost" to={`/guides/${guide.id}/edit`}>
          Редактировать
        </Link>
        <button type="button" className="btn" onClick={makeLink}>
          Создать ссылку
        </button>
      </div>
      {shareUrl && <p className="share-out">{shareUrl}</p>}

      <p className="section-label">История версий</p>
      <ul className="versions">
        {versions.map((v) => (
          <li key={v.id} className={v.is_current ? "is-current" : ""}>
            Версия {v.version_number}
            {v.is_current ? " (текущая)" : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}
