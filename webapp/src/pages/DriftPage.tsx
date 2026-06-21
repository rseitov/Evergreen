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
    <div>
      <h1>Что устарело</h1>
      {events.length === 0 && <p>Нет открытых расхождений.</p>}
      <ul>
        {events.map((e) => (
          <li key={e.id}>
            <span>Похоже устарел (score {e.score.toFixed(2)})</span>
            {e.draft_text && <p>{e.draft_text}</p>}
            <button type="button" onClick={() => accept(e.id)}>
              Принять
            </button>
            <button type="button" onClick={() => dismiss(e.id)}>
              Отклонить
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
