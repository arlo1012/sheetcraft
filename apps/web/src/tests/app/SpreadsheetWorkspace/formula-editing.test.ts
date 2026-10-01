import { DOMWrapper, flushPromises, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  deserializeWorkbook,
  serializeWorkbook,
  type WorkbookSnapshot,
} from "@idea10/core/serialization";
import {
  createWorkbook,
  getActiveSheet,
  getCellComputedValue,
  getCellContent,
  setCellValue,
} from "@idea10/core/workbook";
import { createSequentialIdFactory } from "@idea10/core/runtime";
import { getFormulaFunctionMetadata } from "@idea10/core/formula";
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

function createMemoryStore(initialSnapshot?: WorkbookSnapshot) {
  let record = initialSnapshot ? { revision: 1, savedAt: 1, snapshot: initialSnapshot } : undefined;
  const store = {
    load: vi.fn(async () => record),
    save: vi.fn(async (snapshot: WorkbookSnapshot, revision: number | undefined) => {
      record = { revision: (revision ?? 0) + 1, savedAt: 1, snapshot };
      return { revision: record.revision, savedAt: record.savedAt };
    }),
    replace: vi.fn(async (snapshot: WorkbookSnapshot) => {
      record = { revision: (record?.revision ?? 0) + 1, savedAt: 1, snapshot };
      return { revision: record.revision, savedAt: record.savedAt };
    }),
  } satisfies WorkbookStore;
  return { store, getRecord: () => record };
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

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
});

describe("workspace formula authoring", () => {
  test("renders matching Core suggestions from the grid editor with SUM as the default", async () => {
    const memory = createMemoryStore();
    const wrapper = await mountWorkspace(memory.store);
    const editor = wrapper.get<HTMLTextAreaElement>("textarea.cell-editor");

    await editor.trigger("keydown", { key: "=" });
    await editor.setValue("=s");

    const suggestions = new DOMWrapper(document.body).get('[role="listbox"]');
    expect(suggestions.findAll('[role="option"]')).toHaveLength(
      getFormulaFunctionMetadata().filter((item) => item.name.startsWith("S")).length,
    );
    expect(suggestions.get('[data-formula-suggestion="SUM"]').text()).toContain("SUM");
    expect(suggestions.get('[data-formula-suggestion="SUM"]').attributes("aria-selected")).toBe(
      "true",
    );
  });

  test("keeps one formula draft while a grid drag inserts a range, then commits and undoes once", async () => {
    const memory = createMemoryStore(createFormulaFixture());
    const wrapper = await mountWorkspace(memory.store);
    const formula = wrapper.get<HTMLTextAreaElement>("[data-formula-input]");

    formula.element.focus();
    await nextTick();
    await formula.setValue("=s");
    await formula.trigger("keydown", { key: "Tab" });
    expect(formula.element.value).toBe("=SUM(");

    await triggerCanvasCell(wrapper, { row: 0, column: 1 }, "mousedown", {
      button: 0,
      buttons: 1,
      clientX: 145,
      clientY: 12,
    });
    dispatchPointer("pointermove", { buttons: 1, clientX: 250, clientY: 42 });
    dispatchPointer("pointerup", { button: 0, clientX: 250, clientY: 42 });
    await flushPromises();

    expect(formula.element.value).toBe("=SUM(B1:C2");
    expect(document.activeElement).toBe(formula.element);
    expect(
      (wrapper.getComponent(SheetSurface).props("overlays") as { referenceGroups?: unknown[] })
        .referenceGroups ?? [],
    ).not.toHaveLength(0);
    expect(wrapper.get("textarea.cell-editor").attributes("data-cell-editor")).toBe("A1");

    await formula.setValue("=SUM(B1:C2)");
    await formula.trigger("keydown", { key: "Enter" });
    await flushPromises();
    expect(wrapper.get("textarea.cell-editor").attributes("data-cell-editor")).toBe("A2");

    const editor = wrapper.get<HTMLTextAreaElement>("textarea.cell-editor");
    await editor.trigger("keydown", { key: "s", ctrlKey: true });
    await flushPromises();
    const savedFormula = memory.getRecord();
    const savedSheet = getActiveSheet(deserializeWorkbook(savedFormula!.snapshot));
    expect(getCellContent(savedSheet, { row: 0, column: 0 })).toEqual({
      kind: "formula",
      formula: { source: "=SUM(B1:C2)" },
    });
    expect(getCellComputedValue(savedSheet, { row: 0, column: 0 })).toBe(10);

    await editor.trigger("keydown", { key: "z", ctrlKey: true });
    await editor.trigger("keydown", { key: "s", ctrlKey: true });
    await flushPromises();

    const saved = memory.getRecord();
    expect(
      getCellContent(getActiveSheet(deserializeWorkbook(saved!.snapshot)), {
        row: 0,
        column: 0,
      }),
    ).toBeNull();
  });

  test("cycles the last picked relative reference with F4 without committing the draft", async () => {
    const memory = createMemoryStore(createFormulaFixture());
    const wrapper = await mountWorkspace(memory.store);
    const formula = wrapper.get<HTMLTextAreaElement>("[data-formula-input]");

    formula.element.focus();
    await nextTick();
    await formula.setValue("=SUM(");
    await triggerCanvasCell(wrapper, { row: 0, column: 1 }, "mousedown", {
      button: 0,
      buttons: 1,
      clientX: 145,
      clientY: 12,
    });
    dispatchPointer("pointerup", { button: 0, clientX: 145, clientY: 12 });
    await flushPromises();
    await formula.trigger("keydown", { key: "F4" });

    expect(formula.element.value).toBe("=SUM($B$1");
    expect(
      getCellContent(getActiveSheet(deserializeWorkbook(memory.getRecord()!.snapshot)), {
        row: 0,
        column: 0,
      }),
    ).toBeNull();
  });

  test("shares one draft between the formula bar and grid editor without committing on Ctrl+F2", async () => {
    const memory = createMemoryStore(createFormulaFixture());
    const wrapper = await mountWorkspace(memory.store);
    const formula = wrapper.get<HTMLTextAreaElement>("[data-formula-input]");
    const editor = wrapper.get<HTMLTextAreaElement>("textarea.cell-editor");

    await formula.trigger("focus");
    await formula.setValue("draft");
    formula.element.setSelectionRange(2, 4, "forward");
    await formula.trigger("select");
    await formula.trigger("keydown", { key: "F2", ctrlKey: true });
    await nextTick();

    expect(editor.element.value).toBe("draft");
    expect(editor.element.selectionStart).toBe(2);
    expect(editor.element.selectionEnd).toBe(4);
    expect(memory.store.save).not.toHaveBeenCalled();

    await editor.trigger("keydown", { key: "Escape" });
    expect(formula.element.value).toBe("");
    expect(
      getCellContent(getActiveSheet(deserializeWorkbook(memory.getRecord()!.snapshot)), {
        row: 0,
        column: 0,
      }),
    ).toBeNull();
  });

  test("keeps an unfinished formula while changing view settings and hiding the formula bar", async () => {
    const memory = createMemoryStore(createFormulaFixture());
    const wrapper = await mountWorkspace(memory.store);
    const formula = wrapper.get<HTMLTextAreaElement>("[data-formula-input]");
    const editor = wrapper.get<HTMLTextAreaElement>("textarea.cell-editor");

    await formula.trigger("focus");
    await formula.setValue("=SUM(B1");
    formula.element.setSelectionRange(7, 7);
    await formula.trigger("select");
    await wrapper.get('[data-ribbon-category="view"]').trigger("click");
    await wrapper.get('[data-view-tool="zoom-menu"]').trigger("click");
    const preset = new DOMWrapper(document.body).get<HTMLElement>('[data-zoom-preset="75"]');
    preset.element.focus();
    await preset.trigger("click");
    await flushPromises();
    expect(formula.element.value).toBe("=SUM(B1");
    expect(memory.store.save).not.toHaveBeenCalled();
    await wrapper.get('[data-view-option="formula-bar"] input').setValue(false);
    await flushPromises();

    expect(wrapper.findComponent({ name: "WorkbookFormulaBar" }).isVisible()).toBe(false);
    expect(wrapper.classes()).toContain("is-formula-bar-hidden");
    expect(editor.element.value).toBe("=SUM(B1");
    expect(document.activeElement).toBe(editor.element);
    expect(memory.store.save).not.toHaveBeenCalled();

    await editor.trigger("keydown", { key: "F2", ctrlKey: true });
    await flushPromises();
    expect(wrapper.findComponent({ name: "WorkbookFormulaBar" }).isVisible()).toBe(true);
    expect(formula.element.value).toBe("=SUM(B1");
    expect(memory.store.save).not.toHaveBeenCalled();
    await formula.trigger("keydown", { key: "Escape" });
  });

  test("will not save or commit a formula-bar IME draft until its composition completes", async () => {
    const memory = createMemoryStore();
    const wrapper = await mountWorkspace(memory.store);
    const formula = wrapper.get<HTMLTextAreaElement>("[data-formula-input]");

    await formula.trigger("focus");
    await formula.trigger("compositionstart");
    await formula.setValue("=s");
    await formula.trigger("keydown", { key: "Enter", isComposing: true });
    await formula.trigger("keydown", { key: "s", ctrlKey: true });
    await flushPromises();

    expect(formula.element.value).toBe("=s");
    expect(memory.store.save).not.toHaveBeenCalled();

    await formula.trigger("compositionend", { data: "s" });
    await formula.trigger("keydown", { key: "s", ctrlKey: true });
    await flushPromises();
    expect(memory.store.save).toHaveBeenCalledOnce();
  });
});
