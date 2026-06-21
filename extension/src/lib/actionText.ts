import type { DomAnchor } from "./types";

export type ActionKind = "click" | "input";

export function describeAction(kind: ActionKind, anchor: DomAnchor): string {
  const label = anchor.text ? `«${anchor.text}»` : anchor.role ?? "элемент";
  if (kind === "input") {
    return `заполнить поле ${label}`;
  }
  return `нажать ${label}`;
}
