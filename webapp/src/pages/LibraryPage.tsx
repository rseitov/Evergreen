import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../app/AppContext";
import type { GuideSummary, Project } from "../lib/types";

interface ProjectWithGuides {
  project: Project;
  guides: GuideSummary[];
}

export default function LibraryPage() {
  const app = useApp();
  const [data, setData] = useState<ProjectWithGuides[] | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!app.token) return;
      const me = await app.api.me(app.token);
      const org = me.memberships[0];
      if (!org) return;
      app.setOrgId(org.org_id);
      const projects = await app.api.listProjects(app.token, org.org_id);
      const withGuides = await Promise.all(
        projects.map(async (project) => ({
          project,
          guides: await app.api.listGuides(app.token!, org.org_id, project.id),
        })),
      );
      if (active) setData(withGuides);
    }
    void load();
    return () => {
      active = false;
    };
  }, [app]);

  if (!data) return <p className="loading">Загрузка…</p>;

  return (
    <div className="page">
      <div className="page-head">
        <p className="eyebrow">Рабочее пространство</p>
        <h1>Библиотека регламентов</h1>
        <p className="sub">Гайды сгруппированы по проектам. Откройте, чтобы увидеть шаги, версии и поделиться.</p>
      </div>
      {data.length === 0 && (
        <p className="empty">Пока нет проектов. Запишите процесс в расширении или создайте гайд через API.</p>
      )}
      {data.map(({ project, guides }) => (
        <section className="project" key={project.id}>
          <div className="project-head">
            <h2>{project.name}</h2>
            <span className="count mono">{guides.length}</span>
          </div>
          {guides.length === 0 ? (
            <p className="empty">В этом проекте пока нет гайдов.</p>
          ) : (
            <ul className="guide-list">
              {guides.map((g) => (
                <li key={g.id}>
                  <Link to={`/guides/${g.id}`}>{g.title}</Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
