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

describe("ApiClient", () => {
  it("login posts credentials and returns the auth result", async () => {
    const fetchFn = mockFetch(200, { access_token: "tok", user_id: "u1", org_id: "o1" });
    const api = new ApiClient("http://localhost:8077");
    const res = await api.login("a@b.ru", "pw");
    expect(res.access_token).toBe("tok");
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("http://localhost:8077/auth/login");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ email: "a@b.ru", password: "pw" });
  });

  it("me sends the bearer token", async () => {
    const fetchFn = mockFetch(200, { user_id: "u1", email: "a@b.ru", memberships: [] });
    const api = new ApiClient("http://localhost:8077");
    await api.me("tok");
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("http://localhost:8077/auth/me");
    expect(init.headers.Authorization).toBe("Bearer tok");
  });

  it("generate posts the request body to the right path", async () => {
    const fetchFn = mockFetch(201, { id: "g1", title: "T", version_number: 1 });
    const api = new ApiClient("http://localhost:8077");
    const res = await api.generate("tok", "o1", "p1", {
      title_hint: null,
      type: "digital",
      raw_steps: [{ action_text: "нажать «Сохранить»", dom_anchor: null, screenshot_url: null }],
    });
    expect(res.id).toBe("g1");
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("http://localhost:8077/orgs/o1/projects/p1/guides/generate");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body).raw_steps).toHaveLength(1);
  });

  it("throws ApiError with the status on non-2xx", async () => {
    mockFetch(401, { detail: "bad" });
    const api = new ApiClient("http://localhost:8077");
    await expect(api.login("a@b.ru", "wrong")).rejects.toMatchObject({
      name: "ApiError",
      status: 401,
    });
    await expect(api.login("a@b.ru", "wrong")).rejects.toBeInstanceOf(ApiError);
  });

  it("listObservable encodes the url and uses bearer auth", async () => {
    const f = mockFetch(200, [
      { step_id: "s1", guide_id: "g1", url: "https://crm.acme.ru/d/1", fingerprint: null },
    ]);
    const client = new ApiClient("http://localhost:8077");
    const res = await client.listObservable("tok", "o1", "https://crm.acme.ru/d/1");
    expect(res).toHaveLength(1);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe(
      "http://localhost:8077/orgs/o1/steps/observable?url=https%3A%2F%2Fcrm.acme.ru%2Fd%2F1",
    );
    expect(init.headers.Authorization).toBe("Bearer tok");
  });

  it("observeDrift posts the fresh fingerprint", async () => {
    const f = mockFetch(201, { drift: true, score: 0.7, classification: "stale", event_id: "d1" });
    const fp = { dom_anchor: null, semantics: "s", screenshot_url: null, url: "u" };
    const client = new ApiClient("http://localhost:8077");
    const res = await client.observeDrift("tok", "o1", { step_id: "s1", fresh_fingerprint: fp, source: "passive" });
    expect(res.classification).toBe("stale");
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("http://localhost:8077/orgs/o1/drift/observe");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ step_id: "s1", fresh_fingerprint: fp, source: "passive" });
  });
});
