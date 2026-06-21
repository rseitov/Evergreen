import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "../src/App";

describe("scaffolding", () => {
  it("renders the app shell", () => {
    render(<App />);
    expect(screen.getByText("Self-Healing SOP")).toBeInTheDocument();
  });
});
