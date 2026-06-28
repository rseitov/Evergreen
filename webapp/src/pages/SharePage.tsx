import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useApp } from "../app/AppContext";
import Wordmark from "../app/Wordmark";
import type { GuideDetail } from "../lib/types";

export default function SharePage() {
  const app = useApp();
  const { token } = useParams();
  const [guide, setGuide] = useState<GuideDetail | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!token) return;
      const g = await app.api.readSharedGuide(token);
      if (active) setGuide(g);
    }
    void load();
    return () => {
      active = false;
    };
  }, [app, token]);

  if (!guide) {
    return (
      <div className="centered">
        <p className="loading">Загрузка…</p>
      </div>
    );
  }

  return (
    <div className="centered">
      <article className="share-card">
        <span className="badge">Регламент · версия {guide.version_number}</span>
        <h1>{guide.title}</h1>
        <ol className="steps">
          {guide.steps.map((s) => (
            <li key={s.id}>
              <div className="step-body">{s.text}</div>
            </li>
          ))}
        </ol>
        <div className="share-foot">
          <Wordmark />
        </div>
      </article>
    </div>
  );
}
