import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import GuideEditorPage from "../src/pages/GuideEditorPage";
import { makeAppValue, renderWithProviders } from "./helpers";

describe("GuideEditorPage", () => {
  it("edits a step and saves a new version", async () => {
    const api = {
      getGuide: vi.fn().mockResolvedValue({
        id: "g1", title: "T", type: "digital", project_id: "p1",
        version_number: 1, current_version_id: "v1",
        steps: [{ id: "s1", order_index: 0, text: "Старый текст", media_url: null, fingerprint: null }],
        created_at: "",
      }),
      createVersion: vi.fn().mockResolvedValue({
        id: "g1", title: "T", type: "digital", project_id: "p1",
        version_number: 2, current_version_id: "v2", steps: [], created_at: "",
      }),
    };
    renderWithProviders(
      <Routes>
        <Route path="/guides/:guideId/edit" element={<GuideEditorPage />} />
        <Route path="/guides/:guideId" element={<div>guide view</div>} />
      </Routes>,
      { value: makeAppValue({ api: api as never }), route: "/guides/g1/edit" },
    );

    const box = await screen.findByDisplayValue("Старый текст");
    await userEvent.clear(box);
    await userEvent.type(box, "Новый текст");
    await userEvent.click(screen.getByRole("button", { name: "Сохранить новую версию" }));

    await waitFor(() =>
      expect(api.createVersion).toHaveBeenCalledWith("test-token", "o1", "g1", [
        { text: "Новый текст", media_url: null, fingerprint: null },
      ]),
    );
    expect(await screen.findByText("guide view")).toBeInTheDocument();
  });
});
