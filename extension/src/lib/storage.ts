export interface Session {
  token: string;
  baseUrl: string;
  orgId: string | null;
  projectId: string | null;
}

const KEY = "shsop_session";

export async function loadSession(): Promise<Session | null> {
  const data = await chrome.storage.local.get(KEY);
  return (data[KEY] as Session | undefined) ?? null;
}

export async function saveSession(session: Session): Promise<void> {
  await chrome.storage.local.set({ [KEY]: session });
}

export async function clearSession(): Promise<void> {
  await chrome.storage.local.remove(KEY);
}
