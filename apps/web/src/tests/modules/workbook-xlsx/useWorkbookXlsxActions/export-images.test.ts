import { framedPicture } from "../../sheet-images/framed-picture-fixture";
import { effectScope, ref } from "vue";
import { describe, expect, test, vi } from "vitest";
import { createWorkbook, getActiveSheet, setCellContent } from "@sheetcraft/core/workbook";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import type { SheetChartDrawing } from "@sheetcraft/core/sheet-drawings";
import type { ImageAsset, ImageAssetStore } from "../../../../modules/image-assets/imageAssetStore";
import { useWorkbookXlsxActions } from "../../../../modules/workbook-xlsx/useWorkbookXlsxActions";
import type { XlsxWorkerPort } from "../../../../modules/workbook-xlsx/workbookXlsxWorker";
import type { XlsxWorkerRequest } from "../../../../modules/workbook-xlsx/xlsxWorkerProtocol";

function imageAsset(): ImageAsset {
  return {
    id: "image-1",
    mimeType: "image/png",
    width: 2,
    height: 1,
    blob: new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }),
  };
}

function mountActions(assetStore?: ImageAssetStore, timeoutMs?: number) {
  const workbook = createWorkbook({ id: "image-export", sheetId: "images" });
  setCellContent(
    getActiveSheet(workbook),
    { row: 0, column: 0 },
    {
      kind: "image",
      image: { assetId: "image-1", altText: "Export me" },
    },
  );
  const snapshot = serializeWorkbook(workbook);
  const scope = effectScope();
  const flushPendingEdits = vi.fn(() => true);
  const download = vi.fn();
  const postMessage = vi.fn<(request: XlsxWorkerRequest) => void>((request) => {
    queueMicrotask(() =>
      port.onmessage?.({
        data: {
          id: request.id,
          type: "encode",
          ok: true,
          bytes: new Uint8Array([1, 2, 3]).buffer,
          report: { issues: [] },
        },
      } as MessageEvent),
    );
  });
  const port: XlsxWorkerPort = {
    onmessage: null,
    onmessageerror: null,
    onerror: null,
    postMessage,
    terminate: vi.fn(),
  };
  const workerFactory = vi.fn(() => port);
  const actions = scope.run(() =>
    useWorkbookXlsxActions({
      persistence: { loading: ref(false), replaceDocument: vi.fn() } as never,
      getWorkbook: () => workbook,
      getRevision: () => 1,
      flushPendingEdits,
      hasPendingEdits: () => false,
      assetStore,
      timeoutMs,
      workerFactory,
      download,
    }),
  )!;
  return {
    actions,
    workbook,
    snapshot,
    scope,
    download,
    postMessage,
    workerFactory,
    flushPendingEdits,
  };
}

describe("XLSX export image preparation", () => {
  test.each(["elements", "source"] as const)(
    "new chart %s show blocked feedback before flush, assets, worker or download",
    async (field) => {
      const get = vi.fn(async () => imageAsset()),
        f = mountActions({ get, put: vi.fn() });
      const drawing: SheetChartDrawing = {
        id: "chart",
        kind: "chart",
        name: "Chart",
        anchor: { row: 0, column: 0 },
        offsetX: 0,
        offsetY: 0,
        width: 480,
        height: 300,
        text: "",
        shape: "rectangle",
        fill: "#ffffff",
        stroke: "#000000",
        strokeWidth: 1,
        color: "#000000",
        fontSize: 14,
        bold: false,
        italic: false,
        rotation: 0,
        chart: {
          type: "column",
          range: null,
          title: "Chart",
          headerRow: true,
          headerColumn: true,
          seriesBy: "columns",
          legend: true,
          labels: false,
          stacked: false,
          showHidden: false,
          elements: { titlePosition: "overlay" },
        },
      };
      if (field === "source") {
        delete drawing.chart.elements;
        drawing.chart.source = { kind: "series", categories: { kind: "generated" }, series: [] };
      }
      getActiveSheet(f.workbook).drawings = [drawing];
      const before = serializeWorkbook(f.workbook);
      await f.actions.exportXlsx();
      expect(f.actions.feedback.value).toEqual({
        key: field === "source" ? "chart.sourceExportBlocked" : "chart.elementExportBlocked",
        error: true,
        locations: `Sheet1.drawings["chart"].chart.${field}`,
      });
      expect(f.flushPendingEdits).not.toHaveBeenCalled();
      expect(get).not.toHaveBeenCalled();
      expect(f.workerFactory).not.toHaveBeenCalled();
      expect(f.download).not.toHaveBeenCalled();
      expect(serializeWorkbook(f.workbook)).toEqual(before);
      f.scope.stop();
    },
  );
  test("unsupported frame export rejects before committing a cell draft, worker or resource work", async () => {
    const get = vi.fn(async () => imageAsset()),
      f = mountActions({ get, put: vi.fn() });
    getActiveSheet(f.workbook).floatingImages = [framedPicture()];
    const before = serializeWorkbook(f.workbook);
    await f.actions.exportXlsx();
    expect(f.actions.feedback.value).toEqual({ key: "xlsx.feedback.blocked", error: true });
    expect(f.flushPendingEdits).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
    expect(f.workerFactory).not.toHaveBeenCalled();
    expect(f.download).not.toHaveBeenCalled();
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    f.scope.stop();
  });
  test("sends image bytes and the same point-in-time snapshot to the worker before downloading", async () => {
    const asset = imageAsset();
    let finishRead: (value: ImageAsset) => void = () => undefined;
    const get = vi.fn(
      () =>
        new Promise<ImageAsset>((resolve) => {
          finishRead = resolve;
        }),
    );
    const fixture = mountActions({ get, put: vi.fn() });
    const exporting = fixture.actions.exportXlsx();
    expect(fixture.actions.busy.value).toBe(true);
    expect(fixture.workerFactory).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(get).toHaveBeenCalledOnce());
    setCellContent(
      getActiveSheet(fixture.workbook),
      { row: 0, column: 0 },
      {
        kind: "literal",
        value: "Edited while preparing",
      },
    );
    finishRead(asset);
    await exporting;

    const request = fixture.postMessage.mock.calls[0]?.[0];
    expect(request?.type).toBe("encode");
    if (request?.type !== "encode") throw new Error("Expected encode request.");
    expect(request.snapshot).toEqual(fixture.snapshot);
    expect(request.images).toHaveLength(1);
    expect(request.images?.[0]).toMatchObject({
      assetId: asset.id,
      extension: "png",
      width: 2,
      height: 1,
    });
    expect(new Uint8Array(request.images![0]!.bytes)).toEqual(
      new Uint8Array(await asset.blob.arrayBuffer()),
    );
    expect(fixture.download).toHaveBeenCalledOnce();
    expect(fixture.actions.confirmation.value).toBeUndefined();
    expect(fixture.actions.feedback.value).toEqual({ key: "xlsx.feedback.exported", error: false });
    expect(fixture.actions.busy.value).toBe(false);
    fixture.scope.stop();
  });

  test.each(["store", "asset", "read"] as const)(
    "fails without downloading when image %s is unavailable",
    async (missing) => {
      const fixture = mountActions(
        missing === "store"
          ? undefined
          : {
              get: vi.fn(async () => {
                if (missing === "read") throw new Error("storage unavailable");
                return undefined;
              }),
              put: vi.fn(),
            },
      );
      await fixture.actions.exportXlsx();
      expect(fixture.workerFactory).not.toHaveBeenCalled();
      expect(fixture.download).not.toHaveBeenCalled();
      expect(fixture.actions.feedback.value).toEqual({ key: "xlsx.feedback.failed", error: true });
      expect(fixture.actions.confirmation.value).toBeUndefined();
      expect(fixture.actions.busy.value).toBe(false);
      fixture.scope.stop();
    },
  );

  test.each(["cancel", "dispose"] as const)(
    "%s during an image read does not start a worker or download",
    async (action) => {
      const get = vi.fn(() => new Promise<ImageAsset>(() => undefined));
      const fixture = mountActions({ get, put: vi.fn() });
      const exporting = fixture.actions.exportXlsx();
      await vi.waitFor(() => expect(get).toHaveBeenCalledOnce());
      if (action === "cancel") fixture.actions.cancel();
      else fixture.scope.stop();
      await exporting;
      expect(fixture.workerFactory).not.toHaveBeenCalled();
      expect(fixture.download).not.toHaveBeenCalled();
      expect(fixture.actions.feedback.value).toBeUndefined();
      expect(fixture.actions.busy.value).toBe(false);
      fixture.scope.stop();
    },
  );

  test("times out an unresolved image read before creating a worker", async () => {
    const fixture = mountActions(
      {
        get: vi.fn(() => new Promise<ImageAsset>(() => undefined)),
        put: vi.fn(),
      },
      5,
    );
    await fixture.actions.exportXlsx();
    expect(fixture.workerFactory).not.toHaveBeenCalled();
    expect(fixture.download).not.toHaveBeenCalled();
    expect(fixture.actions.feedback.value).toEqual({ key: "xlsx.feedback.timeout", error: true });
    expect(fixture.actions.busy.value).toBe(false);
    fixture.scope.stop();
  });
});
