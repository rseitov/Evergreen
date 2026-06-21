import type { RawStep } from "./types";

export class Recorder {
  private steps: RawStep[] = [];
  private recording = false;

  start(): void {
    this.recording = true;
    this.steps = [];
  }

  isRecording(): boolean {
    return this.recording;
  }

  add(step: RawStep): void {
    if (this.recording) {
      this.steps.push(step);
    }
  }

  count(): number {
    return this.steps.length;
  }

  stop(): RawStep[] {
    this.recording = false;
    return [...this.steps];
  }
}
