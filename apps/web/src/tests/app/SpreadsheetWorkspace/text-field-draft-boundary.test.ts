import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  createWorkbook,
  createSheet,
  getActiveSheet,
  insertSheet,
} from "@sheetcraft/core/workbook";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import SpreadsheetWorkspace from "../../../app/SpreadsheetWorkspace.vue";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import type { createShapeTextFieldDrafts } from "../../../modules/sheet-drawings/shape-text-field-drafts";
import type { useShapeTextEditSession } from "../../../modules/sheet-drawings/useShapeTextEditSession";
import { createMemoryImageAssetStore } from "../../../modules/image-assets/imageAssetStore";
import { createAppI18n } from "../../../shared/i18n";
import * as measurement from "../../../modules/sheet-drawings/shape-text-measure";

const mounted: VueWrapper[] = [];
const unregister: Array<() => unknown> = [];
afterEach(() => {
  unregister.splice(0).forEach((release) => release());
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
  vi.restoreAllMocks();
  document.body.replaceChildren();
});
function state(wrapper: VueWrapper) {
  return (wrapper.vm.$ as unknown as { setupState: unknown }).setupState as {
    session: { workbook: ReturnType<typeof createWorkbook>; history: { undoStack: unknown[] } };
    shapeTextEdit: ReturnType<typeof useShapeTextEditSession>;
    shapeTextFieldDrafts: ReturnType<typeof createShapeTextFieldDrafts>;
  };
}
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
  const workbook = createWorkbook({
    id: "field-draft-boundary",
    sheetId: "owner",
    sheetName: "Owner",
  });
  getActiveSheet(workbook).drawings = [
    createGraphicDrawing("box", "textBox", "alpha beta", { row: 2, column: 2 }),
  ];
  insertSheet(workbook, createSheet("Other", "other"));
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
  await wrapper.get('[data-sheet-drawing-id="box"]').trigger("keydown", { key: "F2" });
  await flushPromises();
  const current = state(wrapper),
    id = current.shapeTextEdit.snapshot.value!.sessionId;
  const callbacks = current.shapeTextEdit.callbacks(id);
  callbacks.setSelection({ start: 0, end: 10, direction: "backward" });
  await flushPromises();
  const field = document.createElement("input");
  field.dataset.shapeTextEditSession = String(id);
  field.setAttribute("aria-label", "Private test font size draft");
  const workspace = wrapper.get<HTMLElement>(".spreadsheet-workspace").element;
  workspace.appendChild(field);
  field.focus();
  await flushPromises();
  const outside = document.createElement("button");
  outside.textContent = "Outside action";
  workspace.appendChild(outside);
  expect(workspace.contains(field)).toBe(true);
  expect(workspace.contains(outside)).toBe(true);
  expect(current.shapeTextEdit.snapshot.value?.sessionId).toBe(id);
  return { wrapper, current, callbacks, id, field, outside };
}
function pointerdown(target: HTMLElement) {
  const event = new PointerEvent("pointerdown", { bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}
function stored(f: Awaited<ReturnType<typeof fixture>>) {
  const drawing = getActiveSheet(f.current.session.workbook).drawings![0]!;
  if (drawing.kind !== "textBox") throw Error("Expected the stored TextBox");
  return drawing;
}
function registerField(
  f: Awaited<ReturnType<typeof fixture>>,
  flush: () => boolean,
  blocking = () => true,
) {
  const focus = vi.fn(() => f.field.focus());
  unregister.push(
    f.current.shapeTextFieldDrafts.register({
      owner: `shape-text-${f.id}`,
      current: () => f.current.shapeTextEdit.snapshot.value?.sessionId === f.id,
      flush,
      focus,
      blocking,
    }),
  );
  return focus;
}

describe("real Workspace capture boundary flushes private field drafts before native blur", () => {
  test("the real Ribbon NumericField joins Workspace capture before its native blur", async () => {
    const f = await fixture();
    const size = f.wrapper.get<HTMLInputElement>(
      '[data-ribbon-group="shape-font"] input[data-shape-format-field="fontSizePt"]',
    );
    size.element.focus();
    await size.setValue("invalid size");
    expect(pointerdown(f.outside).defaultPrevented).toBe(true);
    await flushPromises();
    expect(f.current.shapeTextEdit.snapshot.value?.sessionId).toBe(f.id);
    expect(size.element.value).toBe("invalid size");
    expect(document.activeElement).toBe(size.element);
    expect(f.current.session.history.undoStack).toHaveLength(0);
    await size.setValue("24.");
    const blur = vi.fn();
    size.element.addEventListener("blur", blur);
    expect(pointerdown(f.outside).defaultPrevented).toBe(false);
    expect(blur).not.toHaveBeenCalled();
    expect(f.current.shapeTextEdit.snapshot.value).toBeUndefined();
    expect(stored(f)).toMatchObject({
      shapeText: { characterRuns: [{ start: 0, end: 10, fontSize: 32 }] },
    });
    expect(f.current.session.history.undoStack).toHaveLength(1);
    f.outside.focus();
    await flushPromises();
    expect(f.current.session.history.undoStack).toHaveLength(1);
  });

  test("outside pointer capture commits text plus the newly flushed size before the field blurs", async () => {
    const f = await fixture(),
      order: string[] = [];
    f.callbacks.update("typed draft");
    f.callbacks.setSelection({ start: 0, end: 11, direction: "backward" });
    registerField(f, () => {
      order.push("flush");
      return f.callbacks.editField("fontSizePt", 24);
    });
    f.field.addEventListener("blur", () => order.push("blur"));
    f.outside.addEventListener("pointerdown", () => order.push("target-pointerdown"));
    const clicked = vi.fn();
    f.outside.addEventListener("click", clicked);
    const pointer = pointerdown(f.outside);
    expect(pointer.defaultPrevented).toBe(false);
    expect(order).toEqual(["flush", "target-pointerdown"]);
    expect(f.current.shapeTextEdit.snapshot.value).toBeUndefined();
    expect(stored(f)).toMatchObject({
      text: "typed draft",
      shapeText: { characterRuns: [{ start: 0, end: 11, fontSize: 32 }] },
    });
    expect(f.current.session.history.undoStack).toHaveLength(1);
    f.outside.focus();
    f.outside.click();
    await flushPromises();
    expect(order).toEqual(["flush", "target-pointerdown", "blur"]);
    expect(clicked).toHaveBeenCalledOnce();
    expect(f.current.session.history.undoStack).toHaveLength(1);
  });

  test("a rejected field cancels pointer/click navigation and keeps focus on its error draft", async () => {
    const f = await fixture(),
      before = serializeWorkbook(f.current.session.workbook);
    f.callbacks.update("Retained text draft");
    const flush = vi.fn(() => false),
      focus = registerField(f, flush),
      clicked = vi.fn();
    f.outside.addEventListener("click", clicked);
    expect(pointerdown(f.outside).defaultPrevented).toBe(true);
    f.outside.click();
    await flushPromises();
    expect(clicked).not.toHaveBeenCalled();
    expect(flush).toHaveBeenCalled();
    expect(focus).toHaveBeenCalled();
    expect(document.activeElement).toBe(f.field);
    expect(f.current.shapeTextEdit.snapshot.value).toMatchObject({
      sessionId: f.id,
      draftText: "Retained text draft",
    });
    expect(serializeWorkbook(f.current.session.workbook)).toEqual(before);
    expect(f.current.session.history.undoStack).toHaveLength(0);
  });

  test("Enter-accepted field followed by outside capture submits its format intent only once", async () => {
    const f = await fixture();
    let dirty = true;
    const intent = vi.fn(() => f.callbacks.editField("fontSizePt", 24));
    const flush = vi.fn(() => {
      if (!dirty) return true;
      if (!intent()) return false;
      dirty = false;
      return true;
    });
    registerField(f, flush, () => dirty);
    f.field.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        flush();
      }
    });
    f.field.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    );
    expect(intent).toHaveBeenCalledOnce();
    expect(pointerdown(f.outside).defaultPrevented).toBe(false);
    f.outside.focus();
    f.outside.click();
    await flushPromises();
    expect(intent).toHaveBeenCalledOnce();
    expect(f.current.shapeTextEdit.snapshot.value).toBeUndefined();
    expect(f.current.session.history.undoStack).toHaveLength(1);
  });

  test("a retired field and old session callback cannot format or commit a replacement draft", async () => {
    const f = await fixture(),
      flush = vi.fn(() => f.callbacks.editField("fontSizePt", 24));
    registerField(f, flush);
    const root = f.current.shapeTextEdit.snapshot.value!.root;
    expect(f.callbacks.cancel()).toBe(true);
    expect(f.current.shapeTextEdit.begin(root)).toBe(true);
    const next = f.current.shapeTextEdit.snapshot.value!,
      callbacks = f.current.shapeTextEdit.callbacks(next.sessionId);
    callbacks.update("Replacement draft");
    expect(f.callbacks.editField("fontSizePt", 36)).toBe(false);
    expect(f.callbacks.commit()).toBe(false);
    expect(f.current.shapeTextFieldDrafts.flush(`shape-text-${f.id}`).accepted).toBe(false);
    expect(flush).not.toHaveBeenCalled();
    expect(f.current.shapeTextEdit.snapshot.value).toMatchObject({
      sessionId: next.sessionId,
      draftText: "Replacement draft",
    });
    expect(callbacks.commit()).toBe(true);
    expect(flush).not.toHaveBeenCalled();
    expect(stored(f).text).toBe("Replacement draft");
  });

  test("invalid field blocks switching contextual tabs without committing or losing the text session", async () => {
    const f = await fixture();
    registerField(f, () => false);
    const target = f.wrapper.get<HTMLElement>('[data-ribbon-category="shape"]').element;
    pointerdown(target);
    target.click();
    await flushPromises();
    expect(f.wrapper.get('[data-ribbon-category="shape-text"]').attributes("aria-selected")).toBe(
      "true",
    );
    expect(f.current.shapeTextEdit.snapshot.value?.sessionId).toBe(f.id);
    expect(document.activeElement).toBe(f.field);
    expect(f.current.session.history.undoStack).toHaveLength(0);
  });

  test("invalid field blocks an actual sheet-tab click and keeps the active sheet/editor owner", async () => {
    const f = await fixture();
    registerField(f, () => false);
    const target = f.wrapper
      .findAll<HTMLElement>(".workbook-sheet-tabs__tab")
      .find((tab) => tab.text() === "Other")!.element;
    expect(pointerdown(target).defaultPrevented).toBe(true);
    target.click();
    await flushPromises();
    expect(f.current.session.workbook.activeSheetId).toBe("owner");
    expect(f.current.shapeTextEdit.snapshot.value?.sessionId).toBe(f.id);
    expect(document.activeElement).toBe(f.field);
    expect(f.current.session.history.undoStack).toHaveLength(0);
  });
});
