import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  createWorkbook,
  getActiveSheet,
  createSheetEvaluator,
  setCellContent,
  MAX_SHEET_ROWS,
  MAX_SHEET_COLUMNS,
} from "@sheetcraft/core/workbook";
import type { SheetCameraDrawing } from "@sheetcraft/core/sheet-drawings";
import CameraContent from "../../../modules/camera/components/CameraContent.vue";

const wrappers: Array<{ unmount(): void }> = [];
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  vi.restoreAllMocks();
});

function canvasHost() {
  const fillText = vi.fn();
  const fillRect = vi.fn();
  const methods: Record<string, unknown> = {
    fillText,
    fillRect,
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    measureText: (text: string) => ({
      width: text.length * 7,
      actualBoundingBoxAscent: 10,
      actualBoundingBoxDescent: 3,
    }),
  };
  const context = new Proxy(methods, {
    get(target, key: string) {
      return target[key] ?? (target[key] = vi.fn());
    },
  });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  );
  return { fillText, fillRect };
}

function drawing(row: number, column: number): SheetCameraDrawing {
  return {
    id: "camera",
    kind: "camera",
    name: "Camera",
    anchor: { row: 0, column: 0 },
    offsetX: 0,
    offsetY: 0,
    width: 200,
    height: 100,
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
    camera: { range: { start: { row, column }, end: { row, column } }, gridLines: true },
  };
}

describe("camera content using the sheet renderer", () => {
  test.each([
    { row: 2, column: 3 },
    { row: MAX_SHEET_ROWS - 1, column: MAX_SHEET_COLUMNS - 1 },
  ])(
    "renders source text at sheet coordinate $row:$column without crossing geometry boundaries",
    async (address) => {
      const host = canvasHost();
      const sheet = getActiveSheet(createWorkbook({ id: "camera", sheetId: "sheet" }));
      setCellContent(sheet, address, { kind: "literal", value: "Revenue" });
      const wrapper = mount(CameraContent, {
        props: {
          drawing: drawing(address.row, address.column),
          sheet,
          evaluator: createSheetEvaluator(sheet),
          revision: 0,
        },
      });
      wrappers.push(wrapper);
      await nextTick();
      expect(host.fillRect).toHaveBeenCalled();
      expect(host.fillText.mock.calls.some(([text]) => text === "Revenue")).toBe(true);
      expect(wrapper.get("canvas").attributes("aria-label")).toBe("Camera");
    },
  );

  test("refreshes source text when the workbook revision changes", async () => {
    const host = canvasHost();
    const sheet = getActiveSheet(createWorkbook({ id: "camera", sheetId: "sheet" }));
    const address = { row: 0, column: 0 };
    setCellContent(sheet, address, { kind: "literal", value: "Before" });
    const wrapper = mount(CameraContent, {
      props: { drawing: drawing(0, 0), sheet, evaluator: createSheetEvaluator(sheet), revision: 0 },
    });
    wrappers.push(wrapper);
    await nextTick();
    expect(host.fillText.mock.calls.some(([text]) => text === "Before")).toBe(true);
    host.fillText.mockClear();
    setCellContent(sheet, address, { kind: "literal", value: "After" });
    await wrapper.setProps({ revision: 1 });
    expect(host.fillText.mock.calls.some(([text]) => text === "After")).toBe(true);
    expect(host.fillText.mock.calls.some(([text]) => text === "Before")).toBe(false);
  });
});
