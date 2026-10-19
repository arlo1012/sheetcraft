import { mount, flushPromises } from "@vue/test-utils";
import { nextTick } from "vue";
import { expect, test, vi } from "vitest";
import {
  createWorkbook,
  getActiveSheet,
  createSheetEvaluator,
  createSheet,
  createWorkbookEvaluator,
  setCellContent,
} from "@sheetcraft/core/workbook";
import { createChartSourceFromRange } from "@sheetcraft/core/chart-source";
import type { SheetChartDrawing } from "@sheetcraft/core/sheet-drawings";
import { createSheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import { createSheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import { getInstanceByDom } from "echarts/core";
import SpreadsheetWorkspace from "../../../app/SpreadsheetWorkspace.vue";
import ChartElementsToolbar from "../../../modules/charts/components/ChartElementsToolbar.vue";
import { createMemoryImageAssetStore } from "../../../modules/image-assets/imageAssetStore";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import SheetGrid from "../../../modules/sheet-grid/components/SheetGrid.vue";
import SheetDrawingLayer from "../../../modules/sheet-drawings/components/SheetDrawingLayer.vue";
import { createAppI18n } from "../../../shared/i18n";

// This mounts the actual DOM/SVG engine, not the SSR engine or synthetic Vue emits.
test.each(["layer", "workspace"])(
  "native compatibility mouse sequence selects series through %s",
  async (host) => {
    const measure = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      new Proxy(
        {
          measureText: (text: string) => ({ width: text.length * 7 }),
          getTransform: () => new DOMMatrix(),
          createLinearGradient: () => ({ addColorStop() {} }),
        },
        {
          get: (target, key) =>
            key in target ? target[key as keyof typeof target] : () => undefined,
        },
      ) as unknown as CanvasRenderingContext2D,
    );
    const workbook = createWorkbook({ id: "native-pointer", sheetId: "sheet" });
    const sheet = getActiveSheet(workbook);
    [
      ["region", "apple", "pear"],
      ["east", 60, 70],
      ["north", 100, 80],
    ].forEach((row, r) =>
      row.forEach((value, column) =>
        setCellContent(sheet, { row: r, column }, { kind: "literal", value }),
      ),
    );
    const drawing: SheetChartDrawing = {
      id: "chart",
      kind: "chart",
      name: "Chart",
      anchor: { row: 0, column: 0 },
      offsetX: 0,
      offsetY: 0,
      width: 640,
      height: 400,
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
        type: "bar",
        range: { start: { row: 0, column: 0 }, end: { row: 2, column: 2 } },
        title: "",
        headerRow: true,
        headerColumn: true,
        seriesBy: "columns",
        legend: false,
        labels: false,
        stacked: false,
        showHidden: false,
      },
    };
    const layout = createSheetViewportLayout({
      geometry: createSheetGeometry({
        rowCount: 40,
        columnCount: 20,
        rowHeight: 20,
        columnWidth: 80,
      }),
      rows: createRowVisibilityIndex({ rowCount: 40, defaultRowHeight: 20 }),
      viewportSize: { width: 800, height: 600 },
    });
    sheet.drawings = [drawing];
    const wrapper =
      host === "workspace"
        ? mount(SpreadsheetWorkspace, {
            attachTo: document.body,
            props: {
              workbookStore: {
                load: async () => ({
                  revision: 1,
                  savedAt: 1,
                  snapshot: serializeWorkbook(workbook),
                }),
                save: vi.fn(async () => ({ revision: 2, savedAt: 2 })),
                replace: vi.fn(async () => ({ revision: 2, savedAt: 2 })),
              },
              imageAssetStore: createMemoryImageAssetStore(),
            },
            global: { plugins: [createAppI18n("en-US")] },
          })
        : mount(SheetDrawingLayer, {
            attachTo: document.body,
            props: {
              drawings: [drawing],
              sheet,
              evaluator: createSheetEvaluator(sheet),
              revision: 0,
              layout,
              scale: 1,
              readOnly: false,
            },
            global: { plugins: [createAppI18n("en-US")] },
          });
    try {
      await flushPromises();
      await nextTick();
      await flushPromises();
      await vi.waitFor(() => expect(wrapper.find(".chart-content__canvas").exists()).toBe(true));
      const canvas = wrapper.get(".chart-content__canvas").element as HTMLElement;
      const instance = getInstanceByDom(canvas)!;
      expect(instance).toBeTruthy();
      const model = (
        instance as unknown as {
          getModel(): {
            getSeries(): Array<{
              getData(): {
                getItemLayout(index: number): {
                  x: number;
                  y: number;
                  width: number;
                  height: number;
                };
                getItemVisual(index: number, key: string): { fill: string };
              };
            }>;
          };
        }
      ).getModel();
      const item = model.getSeries()[0]!.getData().getItemLayout(0);
      let x = item.x + item.width / 2,
        y = item.y + item.height / 2;
      const svg = canvas.querySelector("svg")!;
      const barTarget = (series: number) => {
        const fill = model.getSeries()[series]!.getData().getItemVisual(0, "style").fill;
        const target = svg.querySelector(`path[fill="${fill}"]`);
        expect(target).toBeTruthy();
        return target!;
      };
      let target = barTarget(0);
      const resolver = wrapper.getComponent(SheetDrawingLayer).props("resolveSheet");
      const event = (type: string, detail = 1) => {
        const e = new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
          buttons: type.endsWith("down") ? 1 : 0,
          detail,
        });
        Object.defineProperties(e, { offsetX: { value: x }, offsetY: { value: y } });
        if (type.startsWith("pointer")) Object.defineProperty(e, "pointerId", { value: 1 });
        return e;
      };
      // Chromium suppresses compatibility down/up when pointerdown is cancelled.
      const removed: Node[] = [];
      const observer = new MutationObserver((records) => {
        for (const record of records) removed.push(...record.removedNodes);
      });
      observer.observe(svg, { childList: true, subtree: true });
      const down = event("pointerdown");
      target.dispatchEvent(down);
      await nextTick();
      await flushPromises();
      observer.disconnect();
      expect(removed.filter((node) => node instanceof SVGElement)).toEqual([]);
      if (!down.defaultPrevented) target.dispatchEvent(event("mousedown"));
      await nextTick();
      target.dispatchEvent(event("pointerup"));
      await nextTick();
      if (!down.defaultPrevented) target.dispatchEvent(event("mouseup"));
      target.dispatchEvent(event("click"));
      await nextTick();
      expect(
        wrapper.getComponent(SheetDrawingLayer).emitted("chartElementSelect")?.at(-1)?.[1],
      ).toMatchObject({
        kind: "series",
        rangeBand: { seriesBy: "columns", index: 2 },
      });
      expect(wrapper.getComponent(SheetDrawingLayer).props("resolveSheet")).toBe(resolver);
      target = barTarget(1);
      const second = model.getSeries()[1]!.getData().getItemLayout(0);
      x = second.x + second.width / 2;
      y = second.y + second.height / 2;
      const secondDown = event("pointerdown", 2);
      target.dispatchEvent(secondDown);
      if (!secondDown.defaultPrevented) target.dispatchEvent(event("mousedown", 2));
      target.dispatchEvent(event("pointerup", 2));
      if (!secondDown.defaultPrevented) target.dispatchEvent(event("mouseup", 2));
      target.dispatchEvent(event("click", 2));
      target.dispatchEvent(event("dblclick", 2));
      await nextTick();
      expect(
        wrapper.getComponent(SheetDrawingLayer).emitted("chartElementSelect")?.at(-1)?.[1],
      ).toMatchObject({
        kind: "series",
        rangeBand: { seriesBy: "columns", index: 1 },
      });
      expect(
        wrapper.getComponent(SheetDrawingLayer).emitted("chartElementSelect")?.at(-1)?.[2],
      ).toBe(true);
      expect(wrapper.getComponent(SheetDrawingLayer).emitted("update")).toBeUndefined();
      if (host === "workspace") {
        const toolbar = wrapper.getComponent(ChartElementsToolbar);
        expect(toolbar.props("formatTarget")).toMatchObject({
          kind: "series",
          rangeBand: { seriesBy: "columns", index: 1 },
        });
        const grid = wrapper.getComponent(SheetGrid);
        const gridHost = mount(SheetGrid, {
          props: grid.props(),
          global: { plugins: [createAppI18n("en-US")] },
        });
        try {
          const liveResolver = gridHost.getComponent(SheetDrawingLayer).props("resolveSheet")!;
          const replacement = createWorkbook({ id: "replacement", sheetId: "replacement-sheet" });
          const replacementSheet = getActiveSheet(replacement);
          const sourceSheet = createSheet("Source", "external-source");
          // Use the same ordinary data through an explicitly cross-sheet source.
          [
            ["region", "apple", "pear"],
            ["east", 60, 70],
            ["north", 100, 80],
          ].forEach((row, r) =>
            row.forEach((value, column) =>
              setCellContent(sourceSheet, { row: r, column }, { kind: "literal", value }),
            ),
          );
          replacement.sheets.set(sourceSheet.id, sourceSheet);
          replacementSheet.drawings = [
            {
              ...drawing,
              chart: {
                ...drawing.chart,
                range: null,
                source: createChartSourceFromRange(sourceSheet.id, drawing.chart, sourceSheet),
              },
            },
          ];
          await gridHost.setProps({
            workbook: replacement,
            sheet: replacementSheet,
            evaluator: createWorkbookEvaluator(replacement, replacementSheet.id),
            workbookRevision: 10,
          });
          await flushPromises();
          const numericValue = () => {
            const chart = getInstanceByDom(
              gridHost.get(".chart-content__canvas").element as HTMLElement,
            )!;
            return (
              chart as unknown as {
                getModel(): {
                  getSeries(): Array<{
                    getData(): { get(dimension: string, index: number): number };
                  }>;
                };
              }
            )
              .getModel()
              .getSeries()[0]!
              .getData()
              .get("x", 0);
          };
          expect(numericValue()).toBe(70);
          sourceSheet.name = "Renamed source";
          setCellContent(sourceSheet, { row: 1, column: 2 }, { kind: "literal", value: 77 });
          await gridHost.setProps({
            evaluator: createWorkbookEvaluator(replacement, replacementSheet.id),
            workbookRevision: 11,
          });
          await flushPromises();
          expect(numericValue()).toBe(77);
          const otherOwner = createSheet("Other owner", "other-owner");
          otherOwner.drawings = replacementSheet.drawings;
          replacement.sheets.set(otherOwner.id, otherOwner);
          await gridHost.setProps({
            sheet: otherOwner,
            evaluator: createWorkbookEvaluator(replacement, otherOwner.id),
            workbookRevision: 12,
          });
          await flushPromises();
          expect(numericValue()).toBe(77);
          replacement.sheets.delete(sourceSheet.id);
          await gridHost.setProps({
            evaluator: createWorkbookEvaluator(replacement, otherOwner.id),
            workbookRevision: 13,
          });
          await flushPromises();
          expect(gridHost.find(".chart-content__error").exists()).toBe(true);
          expect(gridHost.getComponent(SheetDrawingLayer).props("resolveSheet")).toBe(liveResolver);
          expect(liveResolver("sheet")).toBeUndefined();
          expect(liveResolver(replacementSheet.id)?.id).toBe(replacementSheet.id);
          replacementSheet.name = "Renamed source";
          setCellContent(replacementSheet, { row: 0, column: 0 }, { kind: "literal", value: 42 });
          expect(liveResolver(replacementSheet.id)?.name).toBe("Renamed source");
          expect(liveResolver(replacementSheet.id)?.cells).toEqual(replacementSheet.cells);
          replacement.sheets.delete(replacementSheet.id);
          expect(liveResolver(replacementSheet.id)).toBeUndefined();
        } finally {
          gridHost.unmount();
        }
      }
    } finally {
      wrapper.unmount();
      measure.mockRestore();
    }
  },
);
