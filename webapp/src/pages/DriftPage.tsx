import { useEffect, useState } from "react";
import { useApp } from "../app/AppContext";
import type { DriftEventOut } from "../lib/types";

export default function DriftPage() {
  const app = useApp();
  const [events, setEvents] = useState<DriftEventOut[]>([]);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!app.token || !app.orgId) return;
      const list = await app.api.listDrift(app.token, app.orgId, "open");
      if (active) setEvents(list);
    }
    void load();
    return () => {
      active = false;
    };
  }, [app]);

  async function accept(id: string) {
    if (!app.token || !app.orgId) return;
    await app.api.acceptDrift(app.token, app.orgId, id);
    setEvents((prev) => prev.filter((e) => e.id !== id));
  }

  async function dismiss(id: string) {
    if (!app.token || !app.orgId) return;
    await app.api.dismissDrift(app.token, app.orgId, id);
    setEvents((prev) => prev.filter((e) => e.id !== id));
  }

  return (
    <div className="page">
      <div className="page-head">
        <p className="eyebrow">Анти-устаревание</p>
        <h1>Что устарело</h1>
        <p className="sub">Расхождения, которые нашёл агент или отметили сотрудники. Примите черновик — выйдет новая версия.</p>
      </div>

      {events.length === 0 && <p className="empty">Нет открытых расхождений.</p>}

      <ul className="drift-list">
        {events.map((e) => (
          <li className="drift-card" key={e.id}>
            <div className="drift-top">
              <span className={`score ${e.score > 0.5 ? "score--stale" : "score--soft"}`}>
                {e.score.toFixed(2)}
              </span>
              <span className="drift-status">Похоже устарел</span>
            </div>
            {e.draft_text && (
              <div className="drift-draft">
                <span className="label">Черновик обновления</span>
                <p className="draft-text">{e.draft_text}</p>
              </div>
            )}
            <div className="btn-row">
              <button type="button" className="btn" onClick={() => accept(e.id)}>
                Принять
              </button>
              <button type="button" className="btn btn-danger" onClick={() => dismiss(e.id)}>
                Отклонить
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
