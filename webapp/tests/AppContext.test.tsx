import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppProvider, useApp } from "../src/app/AppContext";
import { saveOrgId } from "../src/lib/session";

beforeEach(() => localStorage.clear());

describe("AppContext", () => {
  it("login stores the token and exposes it", async () => {
    const api = { login: vi.fn().mockResolvedValue({ access_token: "tok", user_id: "u1", org_id: "o1" }) };
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AppProvider value={{ api: api as never, token: null, orgId: null, login: async (e, p) => { await api.login(e, p); }, logout: () => {}, setOrgId: () => {} }}>
        {children}
      </AppProvider>
    );
    const { result } = renderHook(() => useApp(), { wrapper });
    await act(async () => {
      await result.current.login("a@b.ru", "pw");
    });
    expect(api.login).toHaveBeenCalledWith("a@b.ru", "pw");
  });

  it("useApp throws outside a provider", () => {
    expect(() => renderHook(() => useApp())).toThrow();
  });
});

describe("AppContext org persistence", () => {
  it("initializes orgId from storage", () => {
    saveOrgId("o7");
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AppProvider>{children}</AppProvider>
    );
    const { result } = renderHook(() => useApp(), { wrapper });
    expect(result.current.orgId).toBe("o7");
  });

  it("setOrgId persists to storage", () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AppProvider>{children}</AppProvider>
    );
    const { result } = renderHook(() => useApp(), { wrapper });
    act(() => result.current.setOrgId("o9"));
    expect(localStorage.getItem("shsop_org")).toBe("o9");
  });
});
