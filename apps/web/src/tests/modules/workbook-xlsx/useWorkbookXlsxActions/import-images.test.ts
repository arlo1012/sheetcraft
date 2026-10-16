import { webcrypto } from "node:crypto";
import { effectScope, ref } from "vue";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import {
  createMemoryImageAssetStore,
  type ImageAssetStore,
} from "../../../../modules/image-assets/imageAssetStore";
import { useWorkbookXlsxActions } from "../../../../modules/workbook-xlsx/useWorkbookXlsxActions";
import type { XlsxWorkerImportedImage } from "../../../../modules/workbook-xlsx/xlsxWorkerProtocol";
import type { XlsxWorkerPort } from "../../../../modules/workbook-xlsx/workbookXlsxWorker";
import { actualPng, actualGif } from "../../image-assets/image-header-fixtures";
import { framedPicture } from "../../sheet-images/framed-picture-fixture";

const mounted: Array<{ stop(): void }> = [];
afterEach(() => {
  for (const scope of mounted.splice(0)) scope.stop();
  vi.unstubAllGlobals();
});

function image(assetId = "temporary-image", bytes = actualPng): XlsxWorkerImportedImage {
  return { assetId, bytes: new Uint8Array(bytes).buffer, extension: "png" };
}

function fixture(images: readonly XlsxWorkerImportedImage[] = [image()], store?: ImageAssetStore) {
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:decoded"), revokeObjectURL: vi.fn() });
  vi.stubGlobal(
    "Image",
    class {
      naturalWidth = 2;
      naturalHeight = 1;
      onload?: () => void;
      onerror?: () => void;
      set src(value: string) {
        if (value) queueMicrotask(() => this.onload?.());
      }
    },
  );
  const incoming = createWorkbook({ id: "incoming", sheetId: "images" });
  const sheet = getActiveSheet(incoming);
  const floating = framedPicture();
  floating.assetId = "temporary-image";
  floating.frame.angleDeg = 0;
  sheet.floatingImages = [floating];
  sheet.pageDecoration = { backgroundAssetId: "temporary-image" };
  let workbook = createWorkbook({ id: "original", sheetId: "original-sheet" });
  const original = workbook;
  let revision = 1;
  const replaceDocument = vi.fn(async (next) => {
    workbook = next;
    revision++;
  });
  const assetStore = store ?? createMemoryImageAssetStore();
  const put = vi.spyOn(assetStore, "put");
  const putAll = assetStore.putAll ? vi.spyOn(assetStore, "putAll") : undefined;
  const scope = effectScope();
  mounted.push(scope);
  const port: XlsxWorkerPort = {
    onerror: null,
    onmessage: null,
    onmessageerror: null,
    terminate: vi.fn(),
    postMessage(request) {
      queueMicrotask(() =>
        port.onmessage?.({
          data: {
            id: request.id,
            ok: true,
            type: "decode",
            snapshot: serializeWorkbook(incoming),
            images,
            report: { issues: [] },
          },
        } as MessageEvent),
      );
    },
  };
  const actions = scope.run(() =>
    useWorkbookXlsxActions({
      persistence: { loading: ref(false), replaceDocument } as never,
      getWorkbook: () => workbook,
      getRevision: () => revision,
      flushPendingEdits: () => true,
      hasPendingEdits: () => false,
      workerFactory: () => port,
      assetStore,
    }),
  )!;
  const start = () =>
    actions.importXlsx({ size: 3, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer });
  return {
    actions,
    original,
    incoming,
    getWorkbook: () => workbook,
    start,
    replaceDocument,
    assetStore,
    put,
    putAll,
    changeRevision: () => {
      revision++;
    },
  };
}

describe("XLSX imported picture resources", () => {
  test("decodes and remaps floating/background pictures, then stores before replacement only after confirmation", async () => {
    const f = fixture();
    await f.start();
    expect(f.actions.confirmation.value).toBe("import");
    expect(f.getWorkbook()).toBe(f.original);
    expect(f.put).not.toHaveBeenCalled();
    expect(f.putAll).not.toHaveBeenCalled();
    f.replaceDocument.mockImplementationOnce(async (next) => {
      const root = getActiveSheet(next).floatingImages[0]!;
      expect("assetId" in root && (await f.assetStore.get(root.assetId))).toBeDefined();
    });
    await f.actions.confirm();
    expect(f.putAll).toHaveBeenCalledOnce();
    const next = f.replaceDocument.mock.calls[0]![0];
    const sheet = getActiveSheet(next);
    const floating = sheet.floatingImages[0]!;
    expect(floating).toMatchObject({
      assetId: expect.stringMatching(/^image-[a-f0-9]{64}$/),
      frame: { anchor: { mode: "fixed" } },
    });
    expect(sheet.pageDecoration?.backgroundAssetId).toBe(
      "assetId" in floating ? floating.assetId : undefined,
    );
    expect(f.putAll?.mock.calls[0]?.[0]).toHaveLength(1);
  });

  test("cancelled imports do not write any assets or change the workbook", async () => {
    const f = fixture();
    await f.start();
    f.actions.cancel();
    await f.actions.confirm();
    expect(f.putAll).not.toHaveBeenCalled();
    expect(f.put).not.toHaveBeenCalled();
    expect(f.replaceDocument).not.toHaveBeenCalled();
    expect(f.getWorkbook()).toBe(f.original);
  });

  test.each([
    { images: [] },
    { images: [image(), image()] },
    { images: [image(), image("unused")] },
    { images: [image("temporary-image", Uint8Array.of(1, 2, 3))] },
    { images: [{ ...image(), extension: "gif" as const }] },
  ])(
    "rejects missing, duplicate, unreferenced, corrupt or mismatched image data without writes",
    async ({ images }) => {
      const f = fixture(images);
      await f.start();
      expect(f.actions.feedback.value).toEqual({ key: "xlsx.feedback.invalidImages", error: true });
      expect(f.actions.confirmation.value).toBeUndefined();
      expect(f.putAll).not.toHaveBeenCalled();
      expect(f.put).not.toHaveBeenCalled();
      expect(f.replaceDocument).not.toHaveBeenCalled();
      expect(f.getWorkbook()).toBe(f.original);
    },
  );

  test("a batch save failure never replaces the workbook", async () => {
    const store = createMemoryImageAssetStore();
    store.putAll = vi.fn(async () => {
      throw new Error("quota");
    });
    const f = fixture([image()], store);
    await f.start();
    await f.actions.confirm();
    expect(f.actions.feedback.value).toEqual({
      key: "xlsx.feedback.imageStorageFailed",
      error: true,
    });
    expect(f.actions.confirmation.value).toBeUndefined();
    expect(f.replaceDocument).not.toHaveBeenCalled();
    expect(f.getWorkbook()).toBe(f.original);
  });

  test("old stores without atomic batch support fail before a multi-image write", async () => {
    const f = fixture(
      [
        image(),
        { assetId: "background", extension: "gif", bytes: new Uint8Array(actualGif).buffer },
      ],
      { get: vi.fn(async () => undefined), put: vi.fn() },
    );
    getActiveSheet(f.incoming).pageDecoration = { backgroundAssetId: "background" };
    await f.start();
    await f.actions.confirm();
    expect(f.actions.feedback.value?.key).toBe("xlsx.feedback.imageStorageFailed");
    expect(f.put).not.toHaveBeenCalled();
    expect(f.replaceDocument).not.toHaveBeenCalled();
  });

  test("checks for edits again after saving resources", async () => {
    const f = fixture();
    f.putAll!.mockImplementationOnce(async () => {
      f.changeRevision();
    });
    await f.start();
    await f.actions.confirm();
    expect(f.actions.feedback.value?.key).toBe("xlsx.feedback.stale");
    expect(f.replaceDocument).not.toHaveBeenCalled();
    expect(f.getWorkbook()).toBe(f.original);
  });
});
