import React from "react";
import { afterEach, describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { ActionForm } from "@/components/action-form";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("action form payment validation", () => {
  it("shows returned errors, retains retry key and refreshes only after success", async () => {
    const keys: string[] = [];
    const message =
      "Bu iş üzrə ustaya maksimum 200,00 AZN əlavə ödəniş edilə bilər.";
    const action = vi.fn(async (form: FormData) => {
      keys.push(String(form.get("idempotency_key")));
      if (keys.length === 1) return { error: message };
    });
    render(
      <ActionForm action={action}>
        <input name="amount" defaultValue="250" />
        <button type="submit">Ödə</button>
      </ActionForm>,
    );
    const submit = () =>
      fireEvent.submit(screen.getByRole("button").closest("form")!);
    submit();
    expect((await screen.findByRole("alert")).textContent).toBe(message);
    expect(refresh).not.toHaveBeenCalled();
    submit();
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(keys[1]).toBe(keys[0]);
    submit();
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
    expect(keys[2]).not.toBe(keys[1]);
  });

  it("keeps existing thrown-error and void-success actions working", async () => {
    const action = vi
      .fn<(_: FormData) => Promise<void>>()
      .mockRejectedValueOnce(new Error("Bağlantı xətası"))
      .mockResolvedValueOnce(undefined);
    render(
      <ActionForm action={action}>
        <button type="submit">Saxla</button>
      </ActionForm>,
    );
    fireEvent.submit(screen.getByRole("button").closest("form")!);
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Bağlantı xətası",
    );
    expect(refresh).not.toHaveBeenCalled();
    fireEvent.submit(screen.getByRole("button").closest("form")!);
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });
});
