import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import LibraryPage from "../src/pages/LibraryPage";
import { makeAppValue, renderWithProviders } from "./helpers";

describe("LibraryPage", () => {
  it("lists projects and their guides", async () => {
    const api = {
      me: vi.fn().mockResolvedValue({ user_id: "u1", email: "a@b.ru", memberships: [{ org_id: "o1", role: "owner" }] }),
      listProjects: vi.fn().mockResolvedValue([{ id: "p1", org_id: "o1", name: "Support", allowlist_domains: [], created_at: "" }]),
      listGuides: vi.fn().mockResolvedValue([{ id: "g1", title: "Возврат сделки", type: "digital", project_id: "p1", current_version_id: "v1", created_at: "" }]),
    };
    const setOrgId = vi.fn();
    renderWithProviders(<LibraryPage />, { value: makeAppValue({ api: api as never, setOrgId }) });

    expect(await screen.findByText("Support")).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Возврат сделки" })).toBeInTheDocument();
    expect(setOrgId).toHaveBeenCalledWith("o1");
    expect(api.listGuides).toHaveBeenCalledWith("test-token", "o1", "p1");
  });
});
