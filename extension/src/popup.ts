import { ApiClient } from "./lib/api";
import { loadSession, saveSession, type Session } from "./lib/storage";
import type { Project } from "./lib/types";

interface PopupDeps {
  api: ApiClient;
  baseUrl: string;
  save: (s: Session) => Promise<void>;
  load: () => Promise<Session | null>;
}

export class PopupController {
  private session: Session | null = null;

  constructor(private deps: PopupDeps) {}

  getSession(): Session | null {
    return this.session;
  }

  async login(email: string, password: string): Promise<void> {
    const auth = await this.deps.api.login(email, password);
    this.session = {
      token: auth.access_token,
      baseUrl: this.deps.baseUrl,
      orgId: null,
      projectId: null,
    };
    await this.deps.save(this.session);
  }

  async loadProjects(): Promise<Project[]> {
    if (!this.session) {
      throw new Error("not logged in");
    }
    const me = await this.deps.api.me(this.session.token);
    const first = me.memberships[0];
    if (!first) {
      throw new Error("no organization membership");
    }
    this.session = { ...this.session, orgId: first.org_id };
    await this.deps.save(this.session);
    return this.deps.api.listProjects(this.session.token, first.org_id);
  }

  async selectProject(projectId: string): Promise<void> {
    if (!this.session) {
      throw new Error("not logged in");
    }
    this.session = { ...this.session, projectId };
    await this.deps.save(this.session);
  }
}

// Glue: wire the popup DOM. Guarded so importing under test has no side effects.
if (typeof chrome !== "undefined" && chrome.runtime?.id) {
  const baseUrl = "http://localhost:8077";
  const controller = new PopupController({
    api: new ApiClient(baseUrl),
    baseUrl,
    save: saveSession,
    load: loadSession,
  });

  const $ = (id: string) => document.getElementById(id)!;
  const setStatus = (text: string) => {
    $("status").textContent = text;
  };

  async function showMain(): Promise<void> {
    $("login").classList.add("hidden");
    $("main").classList.remove("hidden");
    const projects = await controller.loadProjects();
    const select = $("project") as HTMLSelectElement;
    select.innerHTML = "";
    for (const p of projects) {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name;
      select.appendChild(opt);
    }
    if (projects[0]) {
      await controller.selectProject(projects[0].id);
    }
  }

  $("login-btn").addEventListener("click", async () => {
    try {
      await controller.login(
        ($("email") as HTMLInputElement).value,
        ($("password") as HTMLInputElement).value,
      );
      await showMain();
    } catch (err) {
      setStatus(`Ошибка входа: ${(err as Error).message}`);
    }
  });

  ($("project") as HTMLSelectElement).addEventListener("change", async (e) => {
    await controller.selectProject((e.target as HTMLSelectElement).value);
  });

  $("start-btn").addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "start" });
    $("start-btn").classList.add("hidden");
    $("stop-btn").classList.remove("hidden");
    setStatus("Идёт запись…");
  });

  $("stop-btn").addEventListener("click", () => {
    setStatus("Собираю гайд…");
    chrome.runtime.sendMessage(
      { type: "stop", session: controller.getSession(), titleHint: null },
      (resp) => {
        $("stop-btn").classList.add("hidden");
        $("start-btn").classList.remove("hidden");
        if (resp?.ok) {
          setStatus(`Готово: гайд ${resp.guide.id} (v${resp.guide.version_number})`);
        } else {
          setStatus(`Ошибка: ${resp?.error ?? "неизвестно"}`);
        }
      },
    );
  });
}
