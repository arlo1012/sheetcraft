import { flushPromises, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import {
  deserializeWorkbook,
  serializeWorkbook,
  type WorkbookSnapshot,
} from "@sheetcraft/core/serialization";
import {
  createWorkbook,
  getActiveSheet,
  getCellComputedValue,
  getCellContent,
  setCellValue,
} from "@sheetcraft/core/workbook";
import SpreadsheetWorkspace from "../../../app/SpreadsheetWorkspace.vue";
import SheetSurface from "../../../modules/sheet-grid/components/SheetSurface.vue";
import type { WorkbookStore } from "../../../modules/workbook-persistence/workbookStore";
import { createAppI18n } from "../../../shared/i18n";
import { triggerCanvasCell } from "../canvas-interaction";

const mounted: Array<{ unmount(): void }> = [];

function createFormulaFixture(): WorkbookSnapshot {
  const workbook = createWorkbook({ idFactory: createSequentialIdFactory() });
  const sheet = getActiveSheet(workbook);
  setCellValue(sheet, { row: 0, column: 1 }, 1);
  setCellValue(sheet, { row: 0, column: 2 }, 2);
  setCellValue(sheet, { row: 1, column: 1 }, 3);
  setCellValue(sheet, { row: 1, column: 2 }, 4);
  return serializeWorkbook(workbook);
}

function createMemoryStore(snapshot = createFormulaFixture()) {
  let record = { revision: 1, savedAt: 1, snapshot };
  const store = {
    load: vi.fn(async () => record),
    save: vi.fn(async (next: WorkbookSnapshot, revision: number | undefined) => {
      record = { revision: (revision ?? 0) + 1, savedAt: 2, snapshot: next };
      return { revision: record.revision, savedAt: record.savedAt };
    }),
    replace: vi.fn(async (next: WorkbookSnapshot) => {
      record = { revision: record.revision + 1, savedAt: 2, snapshot: next };
      return { revision: record.revision, savedAt: record.savedAt };
    }),
  } satisfies WorkbookStore;
  return { store, record: () => record };
}

async function mountWorkspace(store: WorkbookStore) {
  const wrapper = mount(SpreadsheetWorkspace, {
    attachTo: document.body,
    props: { workbookStore: store },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  await flushPromises();
  return wrapper;
}

function dispatchPointer(type: "pointermove" | "pointerup", options: MouseEventInit): void {
  const bounds = document.querySelector(".sheet-grid__scroller")!.getBoundingClientRect();
  const event = new MouseEvent(type, {
    ...options,
    clientX: (options.clientX ?? 0) + bounds.left,
    clientY: (options.clientY ?? 0) + bounds.top,
  }) as PointerEvent;
  Object.defineProperty(event, "pointerId", { value: 1 });
  window.dispatchEvent(event);
}

async function dragReference(
  wrapper: Awaited<ReturnType<typeof mountWorkspace>>,
  start: { row: number; column: number; x: number; y: number },
  end: { x: number; y: number },
) {
  await triggerCanvasCell(wrapper, start, "mousedown", { button: 0, buttons: 1 });
  dispatchPointer("pointermove", { buttons: 1, clientX: end.x, clientY: end.y });
  dispatchPointer("pointerup", { button: 0, clientX: end.x, clientY: end.y });
  await flushPromises();
}

function expectMatchingReferencePresentation(
  wrapper: Awaited<ReturnType<typeof mountWorkspace>>,
  count: number,
) {
  const tokens = wrapper.findAll("[data-formula-text-overlay] [data-formula-reference-token]");
  const groups =
    (
      wrapper.getComponent(SheetSurface).props("overlays") as {
        referenceGroups?: Array<{ key: string; colorIndex: number }>;
      }
    ).referenceGroups ?? [];
  const overlays = wrapper.findAll("[data-formula-text-overlay]");
  expect(overlays).toHaveLength(2);
  expect(tokens).toHaveLength(count * 2);
  expect(groups).toHaveLength(count);
  const expected = groups.map((group) => [group.key, String(group.colorIndex)]);
  for (const overlay of overlays) {
    expect(
      overlay
        .findAll("[data-formula-reference-token]")
        .map((token) => [
          token.attributes("data-reference-key"),
          token.attributes("data-reference-color"),
        ]),
    ).toEqual(expected);
  }
}

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
});

describe("workspace formula references", () => {
  test("formula bar accepts SUM first, picks B1:C2, closes it on Enter, and records one reversible edit", async () => {
    const memory = createMemoryStore();
    const wrapper = await mountWorkspace(memory.store);
    const formula = wrapper.get<HTMLTextAreaElement>("[data-formula-input]");

    formula.element.focus();
    await nextTick();
    await formula.setValue("=s");
    await formula.trigger("keydown", { key: "Enter" });
    expect(formula.element.value).toBe("=SUM(");
    expect(wrapper.get("textarea.cell-editor").attributes("data-cell-editor")).toBe("A1");

    await dragReference(wrapper, { row: 0, column: 1, x: 145, y: 12 }, { x: 250, y: 42 });
    expect(formula.element.value).toBe("=SUM(B1:C2");
    expect(document.activeElement).toBe(formula.element);
    expectMatchingReferencePresentation(wrapper, 1);

    await formula.trigger("keydown", { key: "Enter" });
    await flushPromises();
    const editor = wrapper.get<HTMLTextAreaElement>("textarea.cell-editor");
    await editor.trigger("keydown", { key: "s", ctrlKey: true });
    await flushPromises();

    const sheet = getActiveSheet(deserializeWorkbook(memory.record().snapshot));
    expect(getCellContent(sheet, { row: 0, column: 0 })).toEqual({
      kind: "formula",
      formula: { source: "=SUM(B1:C2)" },
    });
    expect(getCellComputedValue(sheet, { row: 0, column: 0 })).toBe(10);

    await editor.trigger("keydown", { key: "z", ctrlKey: true });
    await editor.trigger("keydown", { key: "s", ctrlKey: true });
    await flushPromises();
    expect(
      getCellContent(getActiveSheet(deserializeWorkbook(memory.record().snapshot)), {
        row: 0,
        column: 0,
      }),
    ).toBeNull();
  });

  test("cell editor completes a picked range and nested SUM closes only its unmatched parentheses", async () => {
    const memory = createMemoryStore();
    const wrapper = await mountWorkspace(memory.store);
    const editor = wrapper.get<HTMLTextAreaElement>("textarea.cell-editor");

    await editor.trigger("keydown", { key: "=" });
    await editor.setValue("=s");
    await editor.trigger("keydown", { key: "Tab" });
    await dragReference(wrapper, { row: 0, column: 1, x: 145, y: 12 }, { x: 250, y: 42 });
    await editor.trigger("keydown", { key: "Enter" });
    expect(wrapper.get("textarea.cell-editor").attributes("data-cell-editor")).toBe("A2");
    expect(wrapper.find("[data-sheet-canvas]").exists()).toBe(true);

    await triggerCanvasCell(wrapper, { row: 2, column: 0 }, "mousedown", { button: 0 });
    const nested = wrapper.get<HTMLTextAreaElement>("textarea.cell-editor");
    await nested.trigger("keydown", { key: "=" });
    await nested.setValue("=SUM(SUM(B1),C2");
    await nested.trigger("keydown", { key: "Enter" });
    await triggerCanvasCell(wrapper, { row: 3, column: 0 }, "mousedown", { button: 0 });
    const alreadyClosed = wrapper.get<HTMLTextAreaElement>("textarea.cell-editor");
    await alreadyClosed.trigger("keydown", { key: "F2" });
    await alreadyClosed.setValue("=SUM(B1)");
    await alreadyClosed.trigger("keydown", { key: "Enter" });
    await wrapper.get<HTMLTextAreaElement>("textarea.cell-editor").trigger("keydown", {
      key: "s",
      ctrlKey: true,
    });
    await flushPromises();

    expect(memory.store.save).toHaveBeenCalledOnce();
    const sheet = getActiveSheet(deserializeWorkbook(memory.record().snapshot));
    expect(getCellContent(sheet, { row: 0, column: 0 })).toEqual({
      kind: "formula",
      formula: { source: "=SUM(B1:C2)" },
    });
    expect(getCellContent(sheet, { row: 2, column: 0 })).toEqual({
      kind: "formula",
      formula: { source: "=SUM(SUM(B1),C2)" },
    });
    expect(getCellComputedValue(sheet, { row: 2, column: 0 })).toBe(5);
    expect(getCellContent(sheet, { row: 3, column: 0 })).toEqual({
      kind: "formula",
      formula: { source: "=SUM(B1)" },
    });
  });

  test("preserves the first range after a typed comma and colors F2-authored references", async () => {
    const memory = createMemoryStore();
    const wrapper = await mountWorkspace(memory.store);
    const formula = wrapper.get<HTMLTextAreaElement>("[data-formula-input]");

    formula.element.focus();
    await nextTick();
    await formula.setValue("=SUM(");
    await dragReference(wrapper, { row: 0, column: 1, x: 145, y: 12 }, { x: 145, y: 42 });
    await formula.setValue("=SUM(B1:B2,");
    await dragReference(wrapper, { row: 0, column: 2, x: 250, y: 12 }, { x: 250, y: 42 });
    expect(formula.element.value).toBe("=SUM(B1:B2,C1:C2");
    expectMatchingReferencePresentation(wrapper, 2);

    await formula.trigger("keydown", { key: "Escape" });
    await triggerCanvasCell(wrapper, { row: 0, column: 0 }, "mousedown", { button: 0 });
    const editor = wrapper.get<HTMLTextAreaElement>("textarea.cell-editor");
    await editor.trigger("keydown", { key: "F2" });
    await editor.setValue("=SUM(B1:B2,C1:C2)");
    expectMatchingReferencePresentation(wrapper, 2);
  });

  test("keeps all typed reference tokens and their matching color outlines while editing", async () => {
    const memory = createMemoryStore();
    const wrapper = await mountWorkspace(memory.store);
    const formula = wrapper.get<HTMLTextAreaElement>("[data-formula-input]");

    formula.element.focus();
    await nextTick();
    await formula.setValue("=SUM(B1:B2,C1:C2)");
    expectMatchingReferencePresentation(wrapper, 2);

    formula.element.setSelectionRange(6, 8);
    await formula.trigger("select");
    await dragReference(wrapper, { row: 0, column: 0, x: 55, y: 12 }, { x: 55, y: 12 });
    expect(formula.element.value).toBe("=SUM(A1,C1:C2)");
    expectMatchingReferencePresentation(wrapper, 2);
  });

  test("does not auto-close during IME composition and clears all reference presentation on Escape", async () => {
    const memory = createMemoryStore();
    const wrapper = await mountWorkspace(memory.store);
    const formula = wrapper.get<HTMLTextAreaElement>("[data-formula-input]");

    formula.element.focus();
    await nextTick();
    await formula.trigger("compositionstart");
    await formula.setValue("=SUM(B1:C2");
    await formula.trigger("keydown", { key: "Enter", isComposing: true });
    expect(formula.element.value).toBe("=SUM(B1:C2");

    await formula.trigger("compositionend", { data: "2" });
    expectMatchingReferencePresentation(wrapper, 1);
    await formula.trigger("keydown", { key: "Escape" });
    expect(wrapper.find("[data-formula-text-overlay]").exists()).toBe(false);
    expect(
      (wrapper.getComponent(SheetSurface).props("overlays") as { referenceGroups?: unknown[] })
        .referenceGroups ?? [],
    ).toHaveLength(0);
  });
});
