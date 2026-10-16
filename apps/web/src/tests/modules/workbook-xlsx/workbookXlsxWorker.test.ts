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
  test.each([
    undefined,
    { issues: null },
    { issues: [{ code: "image-omitted", severity: "unknown", count: 1, locations: [] }] },
    { issues: [{ code: "image-omitted", severity: "warning", count: -1, locations: [] }] },
    { issues: [{ code: "image-omitted", severity: "warning", count: 1, locations: [null] }] },
  ])(
    "fails closed on a malformed compatibility report instead of silently downloading",
    async (report) => {
      const port = worker((request) =>
        port.onmessage?.({
          data: {
            id: request.id,
            ok: true,
            type: "encode",
            bytes: new ArrayBuffer(0),
            report,
          },
        } as MessageEvent),
      );
      await expect(
        runXlsxWorker(
          () => port,
          { id: "malformed-report", type: "encode", snapshot: {} as never },
          { timeoutMs: 100 },
        ),
      ).rejects.toBeInstanceOf(XlsxWorkerFailure);
      expect(port.terminate).toHaveBeenCalledOnce();
    },
  );

  test("transfers each prepared image buffer once without detaching the snapshot", async () => {
    const bytes = new ArrayBuffer(4);
    const otherBytes = new ArrayBuffer(8);
    const image = { assetId: "image", bytes, extension: "png" as const, width: 1, height: 1 };
    const snapshot = { version: 6 } as never;
    const postMessage = vi.fn<XlsxWorkerPort["postMessage"]>((request) => {
      port.onmessage?.({
        data: {
          id: request.id,
          ok: true,
          type: "encode",
          bytes: new ArrayBuffer(0),
          report: { issues: [] },
        },
      } as MessageEvent);
    });
    const port = worker(postMessage);
    const request = {
      id: "images",
      type: "encode" as const,
      snapshot,
      images: [image, { ...image, assetId: "shared" }, { ...image, bytes: otherBytes }],
    };

    await runXlsxWorker(() => port, request, { timeoutMs: 100 });

    expect(postMessage).toHaveBeenCalledWith(request, [bytes, otherBytes]);
    expect(request.snapshot).toBe(snapshot);
    expect(port.terminate).toHaveBeenCalledOnce();
  });

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
