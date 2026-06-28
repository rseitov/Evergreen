import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useApp } from "../app/AppContext";
import { stepsToInputs } from "../lib/steps";
import type { StepInput } from "../lib/types";

export default function GuideEditorPage() {
  const app = useApp();
  const navigate = useNavigate();
  const { guideId } = useParams();
  const [steps, setSteps] = useState<StepInput[] | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!app.token || !app.orgId || !guideId) return;
      const g = await app.api.getGuide(app.token, app.orgId, guideId);
      if (active) setSteps(stepsToInputs(g.steps));
    }
    void load();
    return () => {
      active = false;
    };
  }, [app, guideId]);

  function updateText(index: number, text: string) {
    setSteps((prev) => prev!.map((s, i) => (i === index ? { ...s, text } : s)));
  }

  function addStep() {
    setSteps((prev) => [...(prev ?? []), { text: "", media_url: null, fingerprint: null }]);
  }

  async function save() {
    if (!app.token || !app.orgId || !guideId || !steps) return;
    await app.api.createVersion(app.token, app.orgId, guideId, steps);
    navigate(`/guides/${guideId}`);
  }

  if (!steps) return <p className="loading">Загрузка…</p>;

  return (
    <div className="page">
      <div className="page-head">
        <p className="eyebrow">Редактирование</p>
        <h1>Шаги регламента</h1>
        <p className="sub">Сохранение создаёт новую версию — прежние остаются в истории.</p>
      </div>

      {steps.map((s, i) => (
        <div className="editor-step" key={i}>
          <span className="num">{String(i + 1).padStart(2, "0")}</span>
          <textarea
            aria-label={`Шаг ${i + 1}`}
            value={s.text}
            onChange={(e) => updateText(i, e.target.value)}
          />
        </div>
      ))}

      <div className="btn-row">
        <button type="button" className="btn btn-ghost" onClick={addStep}>
          Добавить шаг
        </button>
        <button type="button" className="btn" onClick={save}>
          Сохранить новую версию
        </button>
      </div>
    </div>
  );
}
