import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { ApiClient } from "../lib/api";
import { clearOrgId, clearToken, loadOrgId, loadToken, saveOrgId, saveToken } from "../lib/session";

export interface AppValue {
  api: ApiClient;
  token: string | null;
  orgId: string | null;
  login(email: string, password: string): Promise<void>;
  logout(): void;
  setOrgId(orgId: string): void;
}

const AppContext = createContext<AppValue | null>(null);

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8077";

export function AppProvider({ value, children }: { value?: AppValue; children: ReactNode }) {
  const api = useMemo(() => new ApiClient(BASE_URL), []);
  const [token, setToken] = useState<string | null>(() => loadToken());
  const [orgId, setOrgIdState] = useState<string | null>(() => loadOrgId());

  const setOrgId = useCallback((id: string) => {
    saveOrgId(id);
    setOrgIdState(id);
  }, []);

  const built = useMemo<AppValue>(
    () => ({
      api,
      token,
      orgId,
      async login(email, password) {
        const auth = await api.login(email, password);
        saveToken(auth.access_token);
        setToken(auth.access_token);
      },
      logout() {
        clearToken();
        clearOrgId();
        setToken(null);
        setOrgIdState(null);
      },
      setOrgId,
    }),
    [api, token, orgId, setOrgId],
  );

  return <AppContext.Provider value={value ?? built}>{children}</AppContext.Provider>;
}

export function useApp(): AppValue {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return ctx;
}
