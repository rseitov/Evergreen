import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClient, ApiError } from "../src/lib/api";

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

const api = () => new ApiClient("http://localhost:8077");

describe("ApiClient", () => {
  it("login posts credentials", async () => {
    const f = mockFetch(200, { access_token: "tok", user_id: "u1", org_id: "o1" });
    const res = await api().login("a@b.ru", "pw");
    expect(res.access_token).toBe("tok");
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("http://localhost:8077/auth/login");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ email: "a@b.ru", password: "pw" });
  });

  it("getGuide sends bearer token to the right path", async () => {
    const f = mockFetch(200, { id: "g1", title: "T", type: "digital", project_id: "p1", version_number: 1, current_version_id: "v1", steps: [], created_at: "" });
    await api().getGuide("tok", "o1", "g1");
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("http://localhost:8077/orgs/o1/guides/g1");
    expect(init.headers.Authorization).toBe("Bearer tok");
  });

  it("createVersion posts the steps body", async () => {
    const f = mockFetch(201, { id: "g1", title: "T", type: "digital", project_id: "p1", version_number: 2, current_version_id: "v2", steps: [], created_at: "" });
    await api().createVersion("tok", "o1", "g1", [{ text: "шаг" }]);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("http://localhost:8077/orgs/o1/guides/g1/versions");
    expect(JSON.parse(init.body)).toEqual({ steps: [{ text: "шаг" }] });
  });

  it("readSharedGuide hits the public path without auth", async () => {
    const f = mockFetch(200, { id: "g1", title: "Public", type: "digital", project_id: "p1", version_number: 1, current_version_id: "v1", steps: [], created_at: "" });
    const res = await api().readSharedGuide("sometoken");
    expect(res.title).toBe("Public");
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("http://localhost:8077/share/sometoken");
    expect(init.headers.Authorization).toBeUndefined();
  });

  it("listDrift appends the status filter", async () => {
    const f = mockFetch(200, []);
    await api().listDrift("tok", "o1", "open");
    expect(f.mock.calls[0][0]).toBe("http://localhost:8077/orgs/o1/drift?status=open");
  });

  it("non-2xx throws ApiError with status", async () => {
    mockFetch(401, { detail: "bad" });
    await expect(api().me("tok")).rejects.toBeInstanceOf(ApiError);
    mockFetch(401, { detail: "bad" });
    await expect(api().me("tok")).rejects.toMatchObject({ status: 401 });
  });
});
