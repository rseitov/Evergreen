import type {
  AuthResult,
  Fingerprint,
  GenerateRequest,
  GuideDetailLite,
  MeResponse,
  ObservableStep,
  ObserveResult,
  Project,
} from "./types";

export class ApiError extends Error {
  constructor(public status: number) {
    super(`API error ${status}`);
    this.name = "ApiError";
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  token?: string;
}

export class ApiClient {
  constructor(private baseUrl: string) {}

  private async request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (opts.token) {
      headers.Authorization = `Bearer ${opts.token}`;
    }
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    if (!res.ok) {
      throw new ApiError(res.status);
    }
    return (await res.json()) as T;
  }

  login(email: string, password: string): Promise<AuthResult> {
    return this.request<AuthResult>("/auth/login", { method: "POST", body: { email, password } });
  }

  me(token: string): Promise<MeResponse> {
    return this.request<MeResponse>("/auth/me", { token });
  }

  listProjects(token: string, orgId: string): Promise<Project[]> {
    return this.request<Project[]>(`/orgs/${orgId}/projects`, { token });
  }

  generate(
    token: string,
    orgId: string,
    projectId: string,
    body: GenerateRequest,
  ): Promise<GuideDetailLite> {
    return this.request<GuideDetailLite>(
      `/orgs/${orgId}/projects/${projectId}/guides/generate`,
      { method: "POST", body, token },
    );
  }

  listObservable(token: string, orgId: string, url: string): Promise<ObservableStep[]> {
    return this.request<ObservableStep[]>(
      `/orgs/${orgId}/steps/observable?url=${encodeURIComponent(url)}`,
      { token },
    );
  }

  observeDrift(
    token: string,
    orgId: string,
    body: { step_id: string; fresh_fingerprint: Fingerprint; source: "passive" },
  ): Promise<ObserveResult> {
    return this.request<ObserveResult>(`/orgs/${orgId}/drift/observe`, {
      method: "POST",
      body,
      token,
    });
  }
}
