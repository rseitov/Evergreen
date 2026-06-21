import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import LoginPage from "../src/pages/LoginPage";
import { makeAppValue, renderWithProviders } from "./helpers";

describe("LoginPage", () => {
  it("logs in and triggers navigation", async () => {
    const login = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(<LoginPage />, { value: makeAppValue({ login, token: null }) });
    await userEvent.type(screen.getByLabelText("Email"), "a@b.ru");
    await userEvent.type(screen.getByLabelText("Пароль"), "pw");
    await userEvent.click(screen.getByRole("button", { name: "Войти" }));
    await waitFor(() => expect(login).toHaveBeenCalledWith("a@b.ru", "pw"));
  });

  it("shows an error message when login fails", async () => {
    const login = vi.fn().mockRejectedValue(new Error("nope"));
    renderWithProviders(<LoginPage />, { value: makeAppValue({ login, token: null }) });
    await userEvent.type(screen.getByLabelText("Email"), "a@b.ru");
    await userEvent.type(screen.getByLabelText("Пароль"), "bad");
    await userEvent.click(screen.getByRole("button", { name: "Войти" }));
    expect(await screen.findByText("Неверная почта или пароль")).toBeInTheDocument();
  });
});
