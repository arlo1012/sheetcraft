import { describe, expect, test, vi } from "vitest";
import {
  runXlsxWorker,
  XlsxWorkerFailure,
  type XlsxWorkerPort,
} from "../../../modules/workbook-xlsx/workbookXlsxWorker";

function worker(postMessage: XlsxWorkerPort["postMessage"]): XlsxWorkerPort {
  return {
    onerror: null,
    onmessage: null,
    onmessageerror: null,
    postMessage,
    terminate: vi.fn(),
  };
}

describe("runXlsxWorker", () => {
  test("cleans up when postMessage throws synchronously", async () => {
    const port = worker(() => {
      throw new Error("clone failed");
    });

    await expect(
      runXlsxWorker(
        () => port,
        { id: "sync", type: "decode", bytes: new ArrayBuffer(0) },
        { timeoutMs: 100 },
      ),
    ).rejects.toMatchObject({
      name: "XlsxWorkerFailure",
      message: "clone failed",
    });
    expect(port.terminate).toHaveBeenCalledOnce();
  });

  test("fails malformed and wrong-type worker responses without leaking the worker", async () => {
    const malformed = worker((_request) => {
      malformed.onmessage?.({ data: null } as MessageEvent);
    });
    await expect(
      runXlsxWorker(
        () => malformed,
        { id: "null", type: "encode", snapshot: {} as never },
        { timeoutMs: 100 },
      ),
    ).rejects.toBeInstanceOf(XlsxWorkerFailure);
    expect(malformed.terminate).toHaveBeenCalledOnce();

    const wrongType = worker((request) => {
      wrongType.onmessage?.({
        data: {
          id: request.id,
          ok: true,
          type: "decode",
          snapshot: {},
          report: { issues: [] },
        },
      } as MessageEvent);
    });
    await expect(
      runXlsxWorker(
        () => wrongType,
        { id: "wrong", type: "encode", snapshot: {} as never },
        { timeoutMs: 100 },
      ),
    ).rejects.toBeInstanceOf(XlsxWorkerFailure);
    expect(wrongType.terminate).toHaveBeenCalledOnce();
  });
});
