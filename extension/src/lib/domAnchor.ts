import type { DomAnchor } from "./types";

function buildSelector(el: Element): string {
  if (el.id) return `#${el.id}`;
  const parts: string[] = [];
  let node: Element | null = el;
  let depth = 0;
  while (node && depth < 3) {
    if (node.id) {
      parts.unshift(`#${node.id}`);
      break;
    }
    let part = node.tagName.toLowerCase();
    const parent: Element | null = node.parentElement;
    if (parent) {
      const sameTag = Array.from(parent.children).filter((c) => c.tagName === node!.tagName);
      if (sameTag.length > 1) {
        part += `:nth-of-type(${sameTag.indexOf(node) + 1})`;
      }
    }
    parts.unshift(part);
    node = parent;
    depth += 1;
  }
  return parts.join(" > ");
}

export function buildAnchor(el: Element): DomAnchor {
  const role = el.getAttribute("role") ?? el.tagName.toLowerCase();
  const rawText = (el.textContent ?? "").trim();
  const text = rawText.length > 0 ? rawText.slice(0, 80) : null;
  return { role, text, selector: buildSelector(el) };
}
