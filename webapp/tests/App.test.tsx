import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "../src/App";
import { makeAppValue, renderWithProviders } from "./helpers";

describe("App routing", () => {
  it("redirects to login when unauthenticated", () => {
    renderWithProviders(<App />, { value: makeAppValue({ token: null }), route: "/" });
    expect(screen.getByText("Вход")).toBeInTheDocument();
  });

  it("shows the public share page without auth", async () => {
    const api = {
      readSharedGuide: vi.fn().mockResolvedValue({
        id: "g1", title: "Публичный", type: "digital", project_id: "p1",
        version_number: 1, current_version_id: "v1", steps: [], created_at: "",
      }),
    };
    renderWithProviders(<App />, { value: makeAppValue({ token: null, api: api as never }), route: "/share/abc" });
    expect(await screen.findByText("Публичный")).toBeInTheDocument();
  });
});
