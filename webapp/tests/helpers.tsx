import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactElement, ReactNode } from "react";
import { AppProvider, type AppValue } from "../src/app/AppContext";

export function makeAppValue(over: Partial<AppValue> = {}): AppValue {
  return {
    api: {} as never,
    token: "test-token",
    orgId: "o1",
    login: async () => {},
    logout: () => {},
    setOrgId: () => {},
    ...over,
  };
}

export function renderWithProviders(
  ui: ReactElement,
  opts: { value?: AppValue; route?: string } = {},
) {
  const value = opts.value ?? makeAppValue();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[opts.route ?? "/"]}>
      <AppProvider value={value}>{children}</AppProvider>
    </MemoryRouter>
  );
  return render(ui, { wrapper });
}
