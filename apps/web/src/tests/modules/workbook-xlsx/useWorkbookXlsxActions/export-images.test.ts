import { readFileSync } from "node:fs";
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

function chartDrawing(): SheetChartDrawing {
  return {
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
}

describe("XLSX export image preparation", () => {
  test.each(["column", "bar", "line"] as const)(
    "native-capable %s element choices reach worker export and download",
    async (type) => {
      const f = mountActions();
      const sheet = getActiveSheet(f.workbook);
      setCellContent(sheet, { row: 0, column: 0 }, null);
      const drawing = chartDrawing();
      drawing.chart.type = type;
      drawing.chart.range = { start: { row: 0, column: 0 }, end: { row: 3, column: 2 } };
      drawing.chart.labels = type !== "line";
      drawing.chart.elements = {
        titlePosition: "overlay",
        legendPosition: "topRight",
        legendOverlay: true,
        ...(type !== "line" ? { labelPosition: "outsideEnd" as const } : {}),
        dataTable: "none",
        labelContent: "value",
        labelScope: "all",
      };
      sheet.drawings = [drawing];
      const before = serializeWorkbook(f.workbook);
      await f.actions.exportXlsx();
      expect(f.flushPendingEdits).toHaveBeenCalledOnce();
      expect(f.workerFactory).toHaveBeenCalledOnce();
      expect(f.postMessage).toHaveBeenCalledOnce();
      expect(f.download).toHaveBeenCalledOnce();
      expect(f.actions.feedback.value?.error).not.toBe(true);
      expect(serializeWorkbook(f.workbook)).toEqual(before);
      f.scope.stop();
    },
  );

  test.each([
    "elements",
    "source",
    "format",
    "presentation",
    "stacked",
    "rectangleSeries",
    "seriesFilter",
    "combo",
  ] as const)(
    "new chart %s show blocked feedback before flush, assets, worker or download",
    async (field) => {
      const get = vi.fn(async () => imageAsset()),
        f = mountActions({ get, put: vi.fn() });
      const drawing = chartDrawing();
      if (field === "elements") drawing.chart.elements = { titlePosition: "none" };
      if (field === "source") {
        delete drawing.chart.elements;
        drawing.chart.source = { kind: "series", categories: { kind: "generated" }, series: [] };
      }
      if (field === "format") {
        delete drawing.chart.elements;
        drawing.chart.format = { valueAxis: { min: 20, max: 180, majorUnit: 40 } };
      }
      if (field === "presentation") {
        delete drawing.chart.elements;
        drawing.chart.presentation = { background: "#202020" };
      }
      if (field === "stacked") {
        delete drawing.chart.elements;
        drawing.chart.stacked = true;
      }
      if (field === "rectangleSeries") {
        delete drawing.chart.elements;
        drawing.chart.range = { start: { row: 0, column: 0 }, end: { row: 3, column: 2 } };
        drawing.chart.rectangleSeries = { rows: [], columns: [{ index: 1, id: "range-series-1" }] };
      }
      if (field === "seriesFilter") {
        delete drawing.chart.elements;
        drawing.chart.seriesFilter = { hiddenSeriesIds: ["retired-filter-id"] };
      }
      if (field === "combo") {
        delete drawing.chart.elements;
        drawing.chart.type = "combo";
      }
      getActiveSheet(f.workbook).drawings = [drawing];
      const before = serializeWorkbook(f.workbook);
      await f.actions.exportXlsx();
      expect(f.actions.feedback.value).toEqual({
        key:
          field === "combo"
            ? "chart.comboExportBlocked"
            : field === "format" ||
                field === "presentation" ||
                field === "stacked" ||
                field === "rectangleSeries"
              ? "chart.formatExportBlocked"
              : field === "seriesFilter"
                ? "chart.seriesFilterExportBlocked"
                : field === "source"
                  ? "chart.sourceExportBlocked"
                  : "chart.elementExportBlocked",
        error: true,
        locations: `Sheet1.drawings["chart"].chart.${field === "combo" ? "type" : field === "elements" ? "elements.titlePosition" : field}`,
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
    const unsupported = framedPicture();
    unsupported.frame.source.widthRatio = 0.5;
    getActiveSheet(f.workbook).floatingImages = [unsupported];
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
  test("a supported 37-degree frame reaches the worker with original image bytes", async () => {
    const bytes = new Uint8Array(
      readFileSync("src/tests/modules/workbook-xlsx/fixtures/asymmetric-native-source.png"),
    );
    const asset: ImageAsset = {
      id: "asset",
      mimeType: "image/png",
      width: 160,
      height: 96,
      blob: new Blob([bytes], { type: "image/png" }),
    };
    const get = vi.fn(async () => asset);
    const f = mountActions({ get, put: vi.fn() });
    const canvas = vi.spyOn(HTMLCanvasElement.prototype, "getContext");
    try {
      const sheet = getActiveSheet(f.workbook);
      setCellContent(sheet, { row: 0, column: 0 }, null);
      const supported = framedPicture();
      expect(supported.frame.angleDeg).toBe(37);
      sheet.floatingImages = [supported];
      const before = serializeWorkbook(f.workbook);
      await f.actions.exportXlsx();
      expect(f.flushPendingEdits).toHaveBeenCalledOnce();
      expect(get).toHaveBeenCalledExactlyOnceWith("asset");
      expect(f.workerFactory).toHaveBeenCalledOnce();
      expect(f.postMessage).toHaveBeenCalledOnce();
      const request = f.postMessage.mock.calls[0]![0];
      if (request.type !== "encode") throw new Error("Expected encode request.");
      expect(request.snapshot).toEqual(before);
      expect(request.images).toHaveLength(1);
      expect(request.images![0]).toMatchObject({
        assetId: "asset",
        extension: "png",
        width: 160,
        height: 96,
      });
      expect(new Uint8Array(request.images![0]!.bytes)).toEqual(bytes);
      expect(request.images![0]!.transform).toBeUndefined();
      expect(canvas).not.toHaveBeenCalled();
      expect(f.download).toHaveBeenCalledOnce();
      expect(f.actions.feedback.value).toEqual({ key: "xlsx.feedback.exported", error: false });
      expect(serializeWorkbook(f.workbook)).toEqual(before);
    } finally {
      canvas.mockRestore();
      f.scope.stop();
    }
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
