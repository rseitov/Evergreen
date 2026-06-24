import { buildAnchor } from "./domAnchor";
import type { Fingerprint, ObservableStep } from "./types";

export interface DriftApi {
  listObservable(token: string, orgId: string, url: string): Promise<ObservableStep[]>;
  observeDrift(
    token: string,
    orgId: string,
    body: { step_id: string; fresh_fingerprint: Fingerprint; source: "passive" },
  ): Promise<unknown>;
}

export async function runDriftScan(
  api: DriftApi,
  token: string,
  orgId: string,
  url: string,
  doc: Document,
): Promise<number> {
  const steps = await api.listObservable(token, orgId, url);
  let observed = 0;
  for (const step of steps) {
    const selector = step.fingerprint?.dom_anchor?.selector;
    const el = selector ? doc.querySelector(selector) : null;
    const fresh: Fingerprint = {
      dom_anchor: el ? buildAnchor(el) : null,
      semantics: step.fingerprint?.semantics ?? "",
      screenshot_url: null,
      url,
    };
    await api.observeDrift(token, orgId, {
      step_id: step.step_id,
      fresh_fingerprint: fresh,
      source: "passive",
    });
    observed += 1;
  }
  return observed;
}
