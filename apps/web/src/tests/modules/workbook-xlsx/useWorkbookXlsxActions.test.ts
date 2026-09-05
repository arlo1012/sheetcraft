import { effectScope, ref } from "vue";
import { describe, expect, test, vi } from "vitest";
import { createWorkbook } from "@idea10/core/workbook";
import { serializeWorkbook } from "@idea10/core/serialization";
import { createSequentialIdFactory } from "@idea10/core/runtime";
import { useWorkbookXlsxActions } from "../../../modules/workbook-xlsx/useWorkbookXlsxActions";
import type {
  XlsxWorkerFactory,
  XlsxWorkerPort,
} from "../../../modules/workbook-xlsx/workbookXlsxWorker";
import type {
  XlsxWorkerRequest,
  XlsxWorkerResponse,
} from "../../../modules/workbook-xlsx/xlsxWorkerProtocol";

function emptyReport() {
  return { issues: [] };
}

function createTestWorkbook() {
  return createWorkbook({ idFactory: createSequentialIdFactory() });
}

function createWorkerFactory(
  respond: (request: XlsxWorkerRequest, worker: XlsxWorkerPort) => void,
): XlsxWorkerFactory {
  return () => {
    const worker: XlsxWorkerPort = {
      onerror: null,
      onmessage: null,
      onmessageerror: null,
      postMessage: (request) => respond(request, worker),
      terminate: vi.fn(),
    };
    return worker;
  };
}

function response(worker: XlsxWorkerPort, value: XlsxWorkerResponse): void {
  queueMicrotask(() => worker.onmessage?.({ data: value } as MessageEvent<XlsxWorkerResponse>));
}

function file(size = 3): Pick<File, "arrayBuffer" | "size"> {
  return { size, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
}

function mountActions(factory: XlsxWorkerFactory, options: { timeoutMs?: number } = {}) {
  const scope = effectScope();
  let workbook = createTestWorkbook();
  let revision = 1;
  const replaceDocument = vi.fn(async (next) => {
    workbook = next;
    revision += 1;
  });
  const persistence = { loading: ref(false), replaceDocument };
  const download = vi.fn();
  const actions = scope.run(() =>
    useWorkbookXlsxActions({
      persistence: persistence as never,
      getWorkbook: () => workbook,
      getRevision: () => revision,
      flushPendingEdits: () => true,
      hasPendingEdits: () => false,
      workerFactory: factory,
      download,
      ...options,
    }),
  );
  if (!actions) throw new Error("Could not create XLSX actions.");
  return {
    actions,
    download,
    getRevision: () => revision,
    replaceDocument,
    scope,
    setRevision: (next: number) => (revision = next),
  };
}

describe("useWorkbookXlsxActions", () => {
  test("always confirms a decoded import and leaves the workbook unchanged when cancelled", async () => {
    const snapshot = serializeWorkbook(createTestWorkbook());
    const fixture = mountActions(
      createWorkerFactory((request, worker) =>
        response(worker, {
          id: request.id,
          ok: true,
          type: "decode",
          snapshot,
          report: emptyReport(),
        }),
      ),
    );

    await fixture.actions.importXlsx(file());
    expect(fixture.actions.confirmation.value).toBe("import");
    expect(fixture.replaceDocument).not.toHaveBeenCalled();

    fixture.actions.cancel();
    expect(fixture.actions.confirmation.value).toBeUndefined();
    expect(fixture.replaceDocument).not.toHaveBeenCalled();
    fixture.scope.stop();
  });

  test("rejects a stale decoded import before it can replace the document", async () => {
    const snapshot = serializeWorkbook(createTestWorkbook());
    const fixture = mountActions(
      createWorkerFactory((request, worker) => {
        fixture.setRevision(2);
        response(worker, {
          id: request.id,
          ok: true,
          type: "decode",
          snapshot,
          report: emptyReport(),
        });
      }),
    );

    await fixture.actions.importXlsx(file());
    expect(fixture.actions.confirmation.value).toBeUndefined();
    expect(fixture.actions.feedback.value).toEqual({
      key: "xlsx.feedback.stale",
      error: true,
    });
    expect(fixture.replaceDocument).not.toHaveBeenCalled();
    fixture.scope.stop();
  });

  test("rejects oversized files before allocating their bytes", async () => {
    const factory = vi.fn(
      createWorkerFactory(() => {
        throw new Error("Worker should not be created.");
      }),
    );
    const fixture = mountActions(factory);
    const oversized = { size: 25 * 1024 * 1024 + 1, arrayBuffer: vi.fn() };

    await fixture.actions.importXlsx(oversized);
    expect(oversized.arrayBuffer).not.toHaveBeenCalled();
    expect(factory).not.toHaveBeenCalled();
    expect(fixture.actions.feedback.value).toEqual({
      key: "xlsx.feedback.blocked",
      error: true,
    });
    expect(fixture.replaceDocument).not.toHaveBeenCalled();
    fixture.scope.stop();
  });

  test("clears busy state when reading a file fails or is cancelled", async () => {
    const rejected = mountActions(createWorkerFactory(() => undefined));
    await rejected.actions.importXlsx({
      size: 1,
      arrayBuffer: async () => Promise.reject(new Error("read failed")),
    });
    expect(rejected.actions.busy.value).toBe(false);
    expect(rejected.actions.confirmation.value).toBeUndefined();
    expect(rejected.actions.feedback.value).toEqual({
      key: "xlsx.feedback.failed",
      error: true,
    });
    rejected.scope.stop();

    let resolveRead: (bytes: ArrayBuffer) => void = () => undefined;
    const cancelled = mountActions(createWorkerFactory(() => undefined));
    const importPromise = cancelled.actions.importXlsx({
      size: 1,
      arrayBuffer: () =>
        new Promise<ArrayBuffer>((resolve) => {
          resolveRead = resolve;
        }),
    });
    cancelled.actions.cancel();
    resolveRead(new ArrayBuffer(0));
    await importPromise;
    expect(cancelled.actions.busy.value).toBe(false);
    expect(cancelled.actions.confirmation.value).toBeUndefined();
    cancelled.scope.stop();
  });

  test("downloads an export directly even when internal compatibility diagnostics exist", async () => {
    const fixture = mountActions(
      createWorkerFactory((request, worker) =>
        response(worker, {
          id: request.id,
          ok: true,
          type: "encode",
          bytes: new Uint8Array([1, 2]).buffer,
          report: {
            issues: [
              {
                code: "image-omitted",
                severity: "warning",
                count: 1,
                locations: ["A1"],
              },
            ],
          },
        }),
      ),
    );

    await fixture.actions.exportXlsx();
    expect(fixture.actions.confirmation.value).toBeUndefined();
    expect(fixture.download).toHaveBeenCalledWith(new Uint8Array([1, 2]), "workbook.xlsx");
    expect(fixture.download).toHaveBeenCalledOnce();
    expect(fixture.replaceDocument).not.toHaveBeenCalled();
    expect(fixture.getRevision()).toBe(1);
    expect("report" in fixture.actions).toBe(false);
    fixture.scope.stop();
  });

  test("keeps a warning-bearing import pending until replacement is confirmed", async () => {
    const snapshot = serializeWorkbook(createTestWorkbook());
    const fixture = mountActions(
      createWorkerFactory((request, worker) =>
        response(worker, {
          id: request.id,
          ok: true,
          type: "decode",
          snapshot,
          report: {
            issues: [{ code: "image-omitted", severity: "warning", count: 1, locations: ["A1"] }],
          },
        }),
      ),
    );

    await fixture.actions.importXlsx(file());
    expect(fixture.actions.confirmation.value).toBe("import");
    expect(fixture.replaceDocument).not.toHaveBeenCalled();
    fixture.actions.dismissFeedback();
    expect(fixture.actions.confirmation.value).toBe("import");
    await fixture.actions.confirm();
    expect(fixture.actions.confirmation.value).toBeUndefined();
    expect(fixture.replaceDocument).toHaveBeenCalledOnce();
    expect(fixture.download).not.toHaveBeenCalled();
    fixture.scope.stop();
  });

  test("dismisses an error without replacing or downloading the document", async () => {
    const fixture = mountActions(createWorkerFactory(() => undefined));
    await fixture.actions.importXlsx(file(25 * 1024 * 1024 + 1));
    expect(fixture.actions.feedback.value?.error).toBe(true);

    fixture.actions.dismissFeedback();
    expect(fixture.actions.feedback.value).toBeUndefined();
    expect(fixture.replaceDocument).not.toHaveBeenCalled();
    expect(fixture.download).not.toHaveBeenCalled();
    fixture.scope.stop();
  });

  test.each(["encode", "decode"] as const)("still rejects a blocking %s result", async (type) => {
    const fixture = mountActions(
      createWorkerFactory((request, worker) =>
        response(worker, {
          id: request.id,
          ok: true,
          type,
          bytes: new Uint8Array([1]).buffer,
          snapshot: serializeWorkbook(createTestWorkbook()),
          report: {
            issues: [{ code: "archive-limit", severity: "block", count: 1, locations: [] }],
          },
        }),
      ),
    );
    if (type === "encode") await fixture.actions.exportXlsx();
    else await fixture.actions.importXlsx(file());
    expect(fixture.actions.feedback.value).toEqual({ key: "xlsx.feedback.blocked", error: true });
    expect(fixture.actions.confirmation.value).toBeUndefined();
    expect(fixture.download).not.toHaveBeenCalled();
    expect(fixture.replaceDocument).not.toHaveBeenCalled();
    fixture.scope.stop();
  });

  test("contains persistence and download failures while clearing confirmation", async () => {
    const snapshot = serializeWorkbook(createTestWorkbook());
    const imported = mountActions(
      createWorkerFactory((request, worker) =>
        response(worker, {
          id: request.id,
          ok: true,
          type: "decode",
          snapshot,
          report: emptyReport(),
        }),
      ),
    );
    imported.replaceDocument.mockRejectedValueOnce(new Error("storage unavailable"));
    await imported.actions.importXlsx(file());
    await imported.actions.confirm();
    expect(imported.actions.confirmation.value).toBeUndefined();
    expect(imported.actions.feedback.value).toEqual({
      key: "xlsx.feedback.failed",
      error: true,
    });
    imported.scope.stop();

    const exported = mountActions(
      createWorkerFactory((request, worker) =>
        response(worker, {
          id: request.id,
          ok: true,
          type: "encode",
          bytes: new Uint8Array([1]).buffer,
          report: emptyReport(),
        }),
      ),
    );
    exported.download.mockRejectedValueOnce(new Error("download denied"));
    await exported.actions.exportXlsx();
    expect(exported.actions.feedback.value).toEqual({
      key: "xlsx.feedback.failed",
      error: true,
    });
    exported.scope.stop();
  });

  test("surfaces worker errors and terminates workers on timeout", async () => {
    const failed = mountActions(
      createWorkerFactory((request, worker) =>
        response(worker, {
          id: request.id,
          ok: false,
          error: { message: "bad archive", report: emptyReport() },
        }),
      ),
    );
    await failed.actions.importXlsx(file());
    expect(failed.actions.feedback.value).toEqual({
      key: "xlsx.feedback.failed",
      error: true,
    });
    failed.scope.stop();

    let worker: XlsxWorkerPort | undefined;
    const timedOut = mountActions(
      createWorkerFactory((_request, current) => {
        worker = current;
      }),
      { timeoutMs: 1 },
    );
    await timedOut.actions.exportXlsx();
    expect(timedOut.actions.feedback.value).toEqual({
      key: "xlsx.feedback.timeout",
      error: true,
    });
    expect(worker?.terminate).toHaveBeenCalledOnce();
    timedOut.scope.stop();
  });

  test("aborts an active worker when its owner scope is disposed", async () => {
    let worker: XlsxWorkerPort | undefined;
    const fixture = mountActions(
      createWorkerFactory((_request, current) => {
        worker = current;
      }),
    );

    const exportPromise = fixture.actions.exportXlsx();
    await vi.waitFor(() => expect(worker).toBeDefined());
    fixture.scope.stop();
    await exportPromise;
    expect(worker?.terminate).toHaveBeenCalledOnce();
  });
});
