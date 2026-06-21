import { screen } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import SharePage from "../src/pages/SharePage";
import { makeAppValue, renderWithProviders } from "./helpers";

describe("SharePage", () => {
  it("renders a publicly shared guide without auth", async () => {
    const api = {
      readSharedGuide: vi.fn().mockResolvedValue({
        id: "g1", title: "Публичный гайд", type: "digital", project_id: "p1",
        version_number: 1, current_version_id: "v1",
        steps: [{ id: "s1", order_index: 0, text: "Сделай это", media_url: null, fingerprint: null }],
        created_at: "",
      }),
    };
    renderWithProviders(
      <Routes>
        <Route path="/share/:token" element={<SharePage />} />
      </Routes>,
      { value: makeAppValue({ api: api as never, token: null }), route: "/share/abc" },
    );

    expect(await screen.findByText("Публичный гайд")).toBeInTheDocument();
    expect(await screen.findByText("Сделай это")).toBeInTheDocument();
    expect(api.readSharedGuide).toHaveBeenCalledWith("abc");
  });
});
