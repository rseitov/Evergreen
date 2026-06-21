export interface DomAnchor {
  role: string | null;
  text: string | null;
  selector: string;
}

export interface RawStep {
  action_text: string;
  dom_anchor: DomAnchor | null;
  screenshot_url: string | null;
}

export interface GenerateRequest {
  title_hint: string | null;
  type: "digital" | "offline";
  raw_steps: RawStep[];
}

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

export interface AuthResult {
  access_token: string;
  user_id: string;
  org_id: string | null;
}

export interface GuideDetailLite {
  id: string;
  title: string;
  version_number: number;
}
