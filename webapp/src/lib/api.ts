import type {
  AuthResult,
  DriftEventOut,
  GuideDetail,
  GuideSummary,
  MeResponse,
  Project,
  ShareLinkOut,
  StepInput,
  VersionSummary,
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

  listGuides(token: string, orgId: string, projectId: string): Promise<GuideSummary[]> {
    return this.request<GuideSummary[]>(`/orgs/${orgId}/projects/${projectId}/guides`, { token });
  }

  getGuide(token: string, orgId: string, guideId: string): Promise<GuideDetail> {
    return this.request<GuideDetail>(`/orgs/${orgId}/guides/${guideId}`, { token });
  }

  listVersions(token: string, orgId: string, guideId: string): Promise<VersionSummary[]> {
    return this.request<VersionSummary[]>(`/orgs/${orgId}/guides/${guideId}/versions`, { token });
  }

  createVersion(
    token: string,
    orgId: string,
    guideId: string,
    steps: StepInput[],
  ): Promise<GuideDetail> {
    return this.request<GuideDetail>(`/orgs/${orgId}/guides/${guideId}/versions`, {
      method: "POST",
      body: { steps },
      token,
    });
  }

  createShareLink(token: string, orgId: string, guideId: string): Promise<ShareLinkOut> {
    return this.request<ShareLinkOut>(`/orgs/${orgId}/guides/${guideId}/share`, {
      method: "POST",
      token,
    });
  }

  readSharedGuide(shareToken: string): Promise<GuideDetail> {
    return this.request<GuideDetail>(`/share/${shareToken}`);
  }

  listDrift(token: string, orgId: string, status?: string): Promise<DriftEventOut[]> {
    const query = status ? `?status=${status}` : "";
    return this.request<DriftEventOut[]>(`/orgs/${orgId}/drift${query}`, { token });
  }

  acceptDrift(token: string, orgId: string, eventId: string): Promise<DriftEventOut> {
    return this.request<DriftEventOut>(`/orgs/${orgId}/drift/${eventId}/accept`, {
      method: "POST",
      token,
    });
  }

  dismissDrift(token: string, orgId: string, eventId: string): Promise<DriftEventOut> {
    return this.request<DriftEventOut>(`/orgs/${orgId}/drift/${eventId}/dismiss`, {
      method: "POST",
      token,
    });
  }
}
