import { describe, expect, it, vi } from "vitest";
import { PopupController } from "../src/popup";
import type { Session } from "../src/lib/storage";

function makeController(apiOverrides: Record<string, unknown>) {
  let saved: Session | null = null;
  const api = {
    login: vi.fn(),
    me: vi.fn(),
    listProjects: vi.fn(),
    generate: vi.fn(),
    ...apiOverrides,
  };
  const ctrl = new PopupController({
    api: api as never,
    baseUrl: "http://localhost:8077",
    save: async (s: Session) => {
      saved = s;
    },
    load: async () => saved,
  });
  return { ctrl, api, getSaved: () => saved };
}

describe("PopupController", () => {
  it("login builds and saves a session", async () => {
    const { ctrl, getSaved } = makeController({
      login: vi.fn().mockResolvedValue({ access_token: "tok", user_id: "u1", org_id: "o1" }),
    });
    await ctrl.login("a@b.ru", "pw");
    expect(getSaved()).toEqual({
      token: "tok",
      baseUrl: "http://localhost:8077",
      orgId: null,
      projectId: null,
    });
    expect(ctrl.getSession()?.token).toBe("tok");
  });

  it("loadProjects resolves the org from /me and lists projects", async () => {
    const { ctrl, api } = makeController({
      login: vi.fn().mockResolvedValue({ access_token: "tok", user_id: "u1", org_id: "o1" }),
      me: vi.fn().mockResolvedValue({
        user_id: "u1",
        email: "a@b.ru",
        memberships: [{ org_id: "o1", role: "owner" }],
      }),
      listProjects: vi.fn().mockResolvedValue([
        { id: "p1", org_id: "o1", name: "Support", allowlist_domains: [], created_at: "" },
      ]),
    });
    await ctrl.login("a@b.ru", "pw");
    const projects = await ctrl.loadProjects();
    expect(projects).toHaveLength(1);
    expect(api.listProjects).toHaveBeenCalledWith("tok", "o1");
    expect(ctrl.getSession()?.orgId).toBe("o1");
  });

  it("selectProject persists the choice", async () => {
    const { ctrl, getSaved } = makeController({
      login: vi.fn().mockResolvedValue({ access_token: "tok", user_id: "u1", org_id: "o1" }),
    });
    await ctrl.login("a@b.ru", "pw");
    await ctrl.selectProject("p1");
    expect(getSaved()?.projectId).toBe("p1");
    expect(ctrl.getSession()?.projectId).toBe("p1");
  });

  it("loadProjects without a session throws", async () => {
    const { ctrl } = makeController({});
    await expect(ctrl.loadProjects()).rejects.toThrow("not logged in");
  });
});
