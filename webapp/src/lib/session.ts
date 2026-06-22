const KEY = "shsop_token";

export function loadToken(): string | null {
  return localStorage.getItem(KEY);
}

export function saveToken(token: string): void {
  localStorage.setItem(KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(KEY);
}

const ORG_KEY = "shsop_org";

export function loadOrgId(): string | null {
  return localStorage.getItem(ORG_KEY);
}

export function saveOrgId(orgId: string): void {
  localStorage.setItem(ORG_KEY, orgId);
}

export function clearOrgId(): void {
  localStorage.removeItem(ORG_KEY);
}
