import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import GuidePage from "../src/pages/GuidePage";
import { makeAppValue, renderWithProviders } from "./helpers";

function renderGuide(api: unknown) {
  return renderWithProviders(
    <Routes>
      <Route path="/guides/:guideId" element={<GuidePage />} />
    </Routes>,
    { value: makeAppValue({ api: api as never }), route: "/guides/g1" },
  );
}

describe("GuidePage", () => {
  it("flags a step as gone via loop C", async () => {
    const api = {
      getGuide: vi.fn().mockResolvedValue({
        id: "g1", title: "Возврат сделки", type: "digital", project_id: "p1",
        version_number: 1, current_version_id: "v1",
        steps: [{ id: "s1", order_index: 0, text: "Открыть карточку", media_url: null, fingerprint: null }],
        created_at: "",
      }),
      listVersions: vi.fn().mockResolvedValue([
        { id: "v1", version_number: 1, created_by: "u1", created_at: "", is_current: true },
      ]),
      flagDrift: vi.fn().mockResolvedValue({
        id: "d1", step_id: "s1", score: 1, source: "flag", status: "open",
        fresh_fingerprint: null, draft_text: null, created_at: "",
      }),
    };
    renderGuide(api);

    await screen.findByText("Открыть карточку");
    await userEvent.click(screen.getByRole("button", { name: "этого больше нет" }));

    await waitFor(() => expect(api.flagDrift).toHaveBeenCalledWith("test-token", "o1", "s1"));
    expect(await screen.findByText("Помечено как устаревший")).toBeInTheDocument();
  });

  it("renders steps and versions and creates a share link", async () => {
    const api = {
      getGuide: vi.fn().mockResolvedValue({
        id: "g1", title: "Возврат сделки", type: "digital", project_id: "p1",
        version_number: 2, current_version_id: "v2",
        steps: [{ id: "s1", order_index: 0, text: "Открыть карточку", media_url: null, fingerprint: null }],
        created_at: "",
      }),
      listVersions: vi.fn().mockResolvedValue([
        { id: "v2", version_number: 2, created_by: "u1", created_at: "", is_current: true },
        { id: "v1", version_number: 1, created_by: "u1", created_at: "", is_current: false },
      ]),
      createShareLink: vi.fn().mockResolvedValue({ token: "abc", url_path: "/share/abc" }),
    };
    renderGuide(api);

    expect(await screen.findByText("Возврат сделки")).toBeInTheDocument();
    expect(await screen.findByText("Открыть карточку")).toBeInTheDocument();
    expect(api.getGuide).toHaveBeenCalledWith("test-token", "o1", "g1");

    await userEvent.click(screen.getByRole("button", { name: "Создать ссылку" }));
    await waitFor(() => expect(screen.getByText("/share/abc")).toBeInTheDocument());
  });
});
