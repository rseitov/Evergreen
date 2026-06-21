import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import DriftPage from "../src/pages/DriftPage";
import { makeAppValue, renderWithProviders } from "./helpers";

describe("DriftPage", () => {
  it("lists open drift events and dismisses one", async () => {
    const api = {
      listDrift: vi.fn().mockResolvedValue([
        { id: "d1", step_id: "s1", score: 0.7, source: "passive", status: "open", fresh_fingerprint: null, draft_text: "новый текст шага", created_at: "" },
      ]),
      acceptDrift: vi.fn().mockResolvedValue({}),
      dismissDrift: vi.fn().mockResolvedValue({}),
    };
    renderWithProviders(<DriftPage />, { value: makeAppValue({ api: api as never }) });

    expect(await screen.findByText("новый текст шага")).toBeInTheDocument();
    expect(api.listDrift).toHaveBeenCalledWith("test-token", "o1", "open");

    await userEvent.click(screen.getByRole("button", { name: "Отклонить" }));
    await waitFor(() => expect(api.dismissDrift).toHaveBeenCalledWith("test-token", "o1", "d1"));
    await waitFor(() => expect(screen.queryByText("новый текст шага")).not.toBeInTheDocument());
  });
});
