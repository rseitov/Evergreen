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

  if (!data) return <p>Загрузка…</p>;

  return (
    <div>
      <h1>Библиотека регламентов</h1>
      {data.map(({ project, guides }) => (
        <section key={project.id}>
          <h2>{project.name}</h2>
          <ul>
            {guides.map((g) => (
              <li key={g.id}>
                <Link to={`/guides/${g.id}`}>{g.title}</Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
