import { afterEach, describe, expect, test, vi } from "vitest";
import { createWorkbook } from "@sheetcraft/core/workbook";
import { runSimulation } from "../../../../modules/data-tools/simulation-runner";

class FakeWorker {
  static current: FakeWorker | undefined;
  readonly listeners = new Map<string, Array<(event: MessageEvent<any>) => void>>();
  payload: unknown;
  terminated = false;
  constructor() {
    FakeWorker.current = this;
  }
  addEventListener(type: string, handler: (event: MessageEvent<any>) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), handler]);
  }
  postMessage(payload: unknown) {
    this.payload = payload;
    queueMicrotask(() => {
      const event = {
        data: {
          id: (payload as { id: number }).id,
          result: { status: "invalid-input", iterations: 0 },
        },
      } as MessageEvent;
      this.listeners.get("message")?.forEach((listener) => listener(event));
    });
  }
  terminate() {
    this.terminated = true;
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("simulation runner", () => {
  test("sends a serializable workbook snapshot to its worker", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    const workbook = createWorkbook({ id: "book", sheetId: "sheet" });
    await runSimulation({
      kind: "goalSeek",
      workbook,
      request: {
        target: { sheetId: "sheet", address: { row: 0, column: 1 } },
        variable: { sheetId: "sheet", address: { row: 0, column: 0 } },
        targetValue: 1,
      },
    });
    const payload = FakeWorker.current!.payload as { workbookSnapshot: { sheets: unknown[] } };
    expect(Array.isArray(payload.workbookSnapshot.sheets)).toBe(true);
    expect(FakeWorker.current!.terminated).toBe(true);
  });
});
