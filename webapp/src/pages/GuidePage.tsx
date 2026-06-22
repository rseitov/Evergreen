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

  if (!guide) return <p>Загрузка…</p>;

  return (
    <div>
      <h1>{guide.title}</h1>
      <p>Версия {guide.version_number}</p>
      <ol>
        {guide.steps.map((s) => (
          <li key={s.id}>
            {s.text}{" "}
            {flagged.has(s.id) ? (
              <span>Помечено как устаревший</span>
            ) : (
              <button type="button" onClick={() => flag(s.id)}>
                этого больше нет
              </button>
            )}
          </li>
        ))}
      </ol>
      <Link to={`/guides/${guide.id}/edit`}>Редактировать</Link>
      <button type="button" onClick={makeLink}>
        Создать ссылку
      </button>
      {shareUrl && <p>{shareUrl}</p>}
      <h2>История версий</h2>
      <ul>
        {versions.map((v) => (
          <li key={v.id}>
            Версия {v.version_number}
            {v.is_current ? " (текущая)" : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}
