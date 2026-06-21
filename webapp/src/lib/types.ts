export interface Membership {
  org_id: string;
  role: string;
}

export interface MeResponse {
  user_id: string;
  email: string;
  memberships: Membership[];
}

export interface Project {
  id: string;
  org_id: string;
  name: string;
  allowlist_domains: string[];
  created_at: string;
}

export interface StepOut {
  id: string;
  order_index: number;
  text: string;
  media_url: string | null;
  fingerprint: Record<string, unknown> | null;
}

export interface GuideDetail {
  id: string;
  title: string;
  type: string;
  project_id: string;
  version_number: number;
  current_version_id: string;
  steps: StepOut[];
  created_at: string;
}

export interface GuideSummary {
  id: string;
  title: string;
  type: string;
  project_id: string;
  current_version_id: string | null;
  created_at: string;
}

export interface VersionSummary {
  id: string;
  version_number: number;
  created_by: string;
  created_at: string;
  is_current: boolean;
}

export interface AuthResult {
  access_token: string;
  user_id: string;
  org_id: string | null;
}

export interface ShareLinkOut {
  token: string;
  url_path: string;
}

export interface StepInput {
  text: string;
  media_url?: string | null;
  fingerprint?: Record<string, unknown> | null;
}

export interface DriftEventOut {
  id: string;
  step_id: string;
  score: number;
  source: string;
  status: string;
  fresh_fingerprint: Record<string, unknown> | null;
  draft_text: string | null;
  created_at: string;
}
