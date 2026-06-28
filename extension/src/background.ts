import { ApiClient } from "./lib/api";
import { Recorder } from "./lib/recorder";
import type { Session } from "./lib/storage";
import type { GuideDetailLite, RawStep } from "./lib/types";

interface DriftMessage {
  type: string;
  token?: string;
  orgId?: string;
  url?: string;
  body?: { step_id: string; fresh_fingerprint: unknown; source: "passive" };
}

export async function handleDriftMessage(api: ApiClient, message: DriftMessage): Promise<unknown> {
  if (message?.type === "drift.observable") {
    return api.listObservable(message.token!, message.orgId!, message.url!);
  }
  if (message?.type === "drift.observe") {
    return api.observeDrift(message.token!, message.orgId!, message.body as never);
  }
  return null;
}

export class RecordingService {
  private recorder = new Recorder();

  constructor(private api: ApiClient) {}

  start(): void {
    this.recorder.start();
  }

  addStep(step: RawStep): void {
    this.recorder.add(step);
  }

  count(): number {
    return this.recorder.count();
  }

  isRecording(): boolean {
    return this.recorder.isRecording();
  }

  async stopAndGenerate(session: Session, titleHint: string | null): Promise<GuideDetailLite> {
    const steps = this.recorder.stop();
    if (!session.orgId || !session.projectId) {
      throw new Error("project not selected");
    }
    return this.api.generate(session.token, session.orgId, session.projectId, {
      title_hint: titleHint,
      type: "digital",
      raw_steps: steps,
    });
  }
}

// Glue: a singleton service driven by runtime messages. Guarded so importing
// the module under test has no side effects.
if (typeof chrome !== "undefined" && chrome.runtime?.id) {
  const driftApi = new ApiClient("http://localhost:8077");
  const service = new RecordingService(driftApi);
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "step") {
      service.addStep(message.step as RawStep);
      return false;
    }
    if (message?.type === "start") {
      service.start();
      sendResponse({ ok: true });
      return false;
    }
    if (message?.type === "stop") {
      service
        .stopAndGenerate(message.session as Session, (message.titleHint as string) ?? null)
        .then((guide) => sendResponse({ ok: true, guide }))
        .catch((err: Error) => sendResponse({ ok: false, error: err.message }));
      return true; // keep the message channel open for the async response
    }
    if (message?.type === "drift.observable" || message?.type === "drift.observe") {
      handleDriftMessage(driftApi, message)
        .then((result) => sendResponse({ ok: true, result }))
        .catch((err: Error) => sendResponse({ ok: false, error: err.message }));
      return true;
    }
    return false;
  });
}
