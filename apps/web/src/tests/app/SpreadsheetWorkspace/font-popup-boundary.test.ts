import { DOMWrapper, mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import SpreadsheetWorkspace from "../../../app/SpreadsheetWorkspace.vue";
import ShapeCanvasTextEditor from "../../../modules/sheet-drawings/components/ShapeCanvasTextEditor.vue";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import type { useShapeTextEditSession } from "../../../modules/sheet-drawings/useShapeTextEditSession";
import { createMemoryImageAssetStore } from "../../../modules/image-assets/imageAssetStore";
import { createAppI18n } from "../../../shared/i18n";
import {
  writeTextDomSelection,
  readTextDomSelection,
} from "../../../shared/cell-editing/text-dom-selection";
import * as measurement from "../../../modules/sheet-drawings/shape-text-measure";

vi.mock("../../../shared/cell-text/font-resources", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../shared/cell-text/font-resources")>()),
  ensureCellFontResource: vi.fn(async () => undefined),
  cellFontResourceNeedsLoading: () => false,
}));
const mounted: VueWrapper[] = [];
afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
  vi.restoreAllMocks();
  document.body.replaceChildren();
});
function state(wrapper: VueWrapper) {
  return (wrapper.vm.$ as unknown as { setupState: unknown }).setupState as {
    session: { workbook: ReturnType<typeof createWorkbook>; history: { undoStack: unknown[] } };
    shapeTextEdit: ReturnType<typeof useShapeTextEditSession>;
    selectedShapeObjectPaths: readonly (readonly string[])[];
  };
}
const selection = { start: 1, end: 5, direction: "backward" as const };
async function fixture() {
  vi.spyOn(measurement, "getBrowserShapeTextMeasurement").mockReturnValue({
    measurer: {
      measure: (text) => text.length * 8,
      measureMetrics: (text) => ({
        width: text.length * 8,
        ascent: 12,
        descent: 4,
        inkLeft: 0,
        inkRight: text.length * 8,
      }),
    },
    resolveNormalLineMetrics: () => ({
      metrics: { ascent: 12, descent: 4, lineAdvance: 16 },
      policy: "provided-native",
    }),
  });
  const workbook = createWorkbook({ id: "font-popup-boundary", sheetId: "owner" });
  const box = createGraphicDrawing("box", "textBox", "alpha beta", { row: 2, column: 2 });
  box.shapeText!.fontFamily = "Arial";
  getActiveSheet(workbook).drawings = [box];
  const wrapper = mount(SpreadsheetWorkspace, {
    attachTo: document.body,
    props: {
      workbookStore: {
        load: async () => ({ revision: 1, savedAt: 1, snapshot: serializeWorkbook(workbook) }),
        save: vi.fn(async () => ({ revision: 2, savedAt: 2 })),
        replace: vi.fn(async () => ({ revision: 2, savedAt: 2 })),
      },
      imageAssetStore: createMemoryImageAssetStore(),
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  await flushPromises();
  wrapper
    .get<HTMLElement>('[data-sheet-drawing-id="box"]')
    .element.dispatchEvent(
      new KeyboardEvent("keydown", { key: "F2", bubbles: true, cancelable: true }),
    );
  await flushPromises();
  const current = state(wrapper),
    editor = wrapper
      .getComponent(ShapeCanvasTextEditor)
      .get<HTMLElement>("[data-shape-rich-text-input]").element;
  writeTextDomSelection(editor, selection);
  editor.dispatchEvent(new KeyboardEvent("keyup", { key: "Shift", bubbles: true }));
  await flushPromises();
  const id = current.shapeTextEdit.snapshot.value!.sessionId;
  const font = wrapper.get('[data-ribbon-group="shape-font"] .shape-font-family-field');
  const main = font.get<HTMLInputElement>(".font-format-field input");
  const arrow = font.get<HTMLElement>('span[aria-haspopup="menu"]').element;
  const workspace = wrapper.get<HTMLElement>(".spreadsheet-workspace").element;
  expect(workspace.contains(arrow)).toBe(true);
  return { wrapper, current, editor, id, main, arrow, workspace };
}
function pointer(target: HTMLElement) {
  const event = new PointerEvent("pointerdown", {
    bubbles: true,
    cancelable: true,
    button: 0,
    pointerId: 93,
    pointerType: "mouse",
    isPrimary: true,
  });
  target.dispatchEvent(event);
  return event;
}
async function key(target: HTMLElement, value: string) {
  target.dispatchEvent(
    new KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true }),
  );
  await flushPromises();
}
async function openSearch(f: Awaited<ReturnType<typeof fixture>>) {
  pointer(f.arrow);
  f.arrow.click();
  await flushPromises();
  const search = new DOMWrapper(document.body).get<HTMLInputElement>(
    '.font-format-field__search input[type="search"]',
  );
  expect(f.workspace.contains(search.element)).toBe(false);
  expect(search.element.closest(".sheetcraft-font-options-popup")).not.toBeNull();
  return search;
}

describe("native body font popup remains inside the real Workspace text lease", () => {
  test("popup pointer/focus/search Enter preserves the session, backwards range and Core history", async () => {
    const f = await fixture(),
      before = serializeWorkbook(f.current.session.workbook),
      search = await openSearch(f);
    pointer(search.element);
    search.element.focus();
    await search.setValue("Noto");
    await key(search.element, "Enter");
    expect(f.main.element.value).toBe("Arial");
    expect(f.current.shapeTextEdit.snapshot.value).toMatchObject({
      sessionId: f.id,
      sourceId: "box",
      selection,
    });
    expect(f.current.selectedShapeObjectPaths).toEqual([["box"]]);
    expect(f.current.session.history.undoStack).toHaveLength(0);
    expect(serializeWorkbook(f.current.session.workbook)).toEqual(before);
  });

  test("search ArrowDown then native candidate Enter applies selected family and refocuses the same edit lease", async () => {
    const f = await fixture(),
      before = serializeWorkbook(f.current.session.workbook),
      search = await openSearch(f);
    pointer(search.element);
    search.element.focus();
    await search.setValue("Noto Sans CJK SC");
    await key(search.element, "ArrowDown");
    const candidate = document.activeElement;
    if (!(candidate instanceof HTMLElement))
      throw Error("Expected a focused native font candidate");
    expect(candidate.getAttribute("role")).toBe("menuitemradio");
    expect(candidate.textContent).toContain("Noto Sans CJK SC");
    pointer(candidate);
    await key(candidate, "Enter");
    expect(f.current.shapeTextEdit.snapshot.value).toMatchObject({
      sessionId: f.id,
      sourceId: "box",
      selection,
    });
    expect(f.current.shapeTextEdit.snapshot.value!.draftView.shapeText!.characterRuns).toEqual([
      { start: 1, end: 5, fontFamily: "Noto Sans CJK SC" },
    ]);
    expect(document.activeElement).toBe(f.editor);
    expect(readTextDomSelection(f.editor)).toEqual(selection);
    expect(f.current.session.history.undoStack).toHaveLength(0);
    expect(serializeWorkbook(f.current.session.workbook)).toEqual(before);
  });
});
