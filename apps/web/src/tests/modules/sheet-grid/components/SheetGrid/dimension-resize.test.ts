import { describe, expect, test } from "vitest";
import {
  DEFAULT_COLUMN_WIDTH,
  DEFAULT_ROW_HEIGHT,
  MAX_ROW_HEIGHT,
  getCellValue,
  getColumnWidth,
  getRowHeight,
} from "@idea10/core/workbook";
import { createTestClipboardEvent } from "./clipboard-fixture";
import { mountSheetGrid } from "./fixture";

function createPointerEvent(
  type: "pointermove" | "pointerup" | "pointercancel" | "lostpointercapture",
  options: MouseEventInit & { pointerId?: number },
): PointerEvent {
  const event = new MouseEvent(type, options) as PointerEvent;
  Object.defineProperty(event, "pointerId", { value: options.pointerId ?? 1 });
  return event;
}

function dispatchPointer(
  type: "pointermove" | "pointerup" | "pointercancel",
  options: MouseEventInit & { pointerId?: number },
): void {
  const event = createPointerEvent(type, options);
  window.dispatchEvent(event);
}

describe("SheetGrid dimension resizing", () => {
  test("does not turn resize-handle mousedown into a header selection", async () => {
    const { wrapper } = mountSheetGrid();
    await wrapper.get('[data-row="1"][data-column="1"]').trigger("mousedown", { button: 0 });

    await wrapper.get('[data-resize-column="0"]').trigger("mousedown", { button: 0 });
    expect(wrapper.get("[data-active-cell]").attributes("data-active-cell")).toBe("B2");
    expect(wrapper.get('[data-row="1"][data-column="8"]').attributes("aria-selected")).toBe(
      "false",
    );
  });

  test("previews a column resize and commits one undoable command", async () => {
    const { session, sheet, wrapper } = mountSheetGrid();
    await wrapper
      .get('[data-row="1"][data-column="1"]')
      .trigger("mousedown", { button: 0, shiftKey: true });

    await wrapper.get('[data-resize-column="0"]').trigger("pointerdown", {
      button: 0,
      pointerId: 1,
      clientX: DEFAULT_COLUMN_WIDTH,
    });
    dispatchPointer("pointermove", {
      buttons: 1,
      pointerId: 1,
      clientX: DEFAULT_COLUMN_WIDTH + 40,
    });
    await wrapper.vm.$nextTick();

    expect(
      wrapper.get('[data-column="0"].sheet-column-headers__item').attributes("style"),
    ).toContain("width: 136px");
    expect(wrapper.get("[data-selection-range]").attributes("style")).toContain("width: 232px");
    expect(getColumnWidth(sheet, 0)).toBe(DEFAULT_COLUMN_WIDTH);
    expect(session.history.undoStack).toHaveLength(0);

    dispatchPointer("pointerup", { pointerId: 1, clientX: DEFAULT_COLUMN_WIDTH + 40 });
    await wrapper.vm.$nextTick();

    expect(getColumnWidth(sheet, 0)).toBe(136);
    expect(session.history.undoStack).toHaveLength(1);
    await wrapper.get("textarea.cell-editor").trigger("keydown", { key: "z", ctrlKey: true });
    expect(getColumnWidth(sheet, 0)).toBe(DEFAULT_COLUMN_WIDTH);
    expect(wrapper.get("[data-selection-range]").attributes("style")).toContain("width: 192px");
    await wrapper
      .get("textarea.cell-editor")
      .trigger("keydown", { key: "z", ctrlKey: true, shiftKey: true });
    expect(getColumnWidth(sheet, 0)).toBe(136);
  });

  test("clamps row previews and cancels without history", async () => {
    const { session, sheet, wrapper } = mountSheetGrid();
    await wrapper.get('[data-resize-row="0"]').trigger("pointerdown", {
      button: 0,
      pointerId: 2,
      clientY: DEFAULT_ROW_HEIGHT,
    });
    dispatchPointer("pointermove", { buttons: 1, pointerId: 2, clientY: 2_000 });
    await wrapper.vm.$nextTick();

    expect(wrapper.get('[data-row="0"].sheet-row-headers__item').attributes("style")).toContain(
      `height: ${MAX_ROW_HEIGHT}px`,
    );
    dispatchPointer("pointercancel", { pointerId: 2 });
    await wrapper.vm.$nextTick();

    expect(getRowHeight(sheet, 0)).toBe(DEFAULT_ROW_HEIGHT);
    expect(wrapper.get('[data-row="0"].sheet-row-headers__item').attributes("style")).toContain(
      `height: ${DEFAULT_ROW_HEIGHT}px`,
    );
    expect(session.history.undoStack).toHaveLength(0);
  });

  test("preserves redo when a resize handle is released without moving", async () => {
    const { session, sheet, wrapper } = mountSheetGrid();
    await wrapper.get('[data-resize-column="0"]').trigger("pointerdown", {
      button: 0,
      pointerId: 5,
      clientX: DEFAULT_COLUMN_WIDTH,
    });
    dispatchPointer("pointermove", {
      buttons: 1,
      pointerId: 5,
      clientX: DEFAULT_COLUMN_WIDTH + 20,
    });
    dispatchPointer("pointerup", { pointerId: 5, clientX: DEFAULT_COLUMN_WIDTH + 20 });
    await wrapper.get("textarea.cell-editor").trigger("keydown", { key: "z", ctrlKey: true });
    expect(session.history.redoStack).toHaveLength(1);

    await wrapper.get('[data-resize-column="0"]').trigger("pointerdown", {
      button: 0,
      pointerId: 5,
      clientX: DEFAULT_COLUMN_WIDTH,
    });
    dispatchPointer("pointerup", { pointerId: 5, clientX: DEFAULT_COLUMN_WIDTH });
    await wrapper.vm.$nextTick();

    expect(getColumnWidth(sheet, 0)).toBe(DEFAULT_COLUMN_WIDTH);
    expect(session.history.undoStack).toHaveLength(0);
    expect(session.history.redoStack).toHaveLength(1);
    await wrapper
      .get("textarea.cell-editor")
      .trigger("keydown", { key: "z", ctrlKey: true, shiftKey: true });
    expect(getColumnWidth(sheet, 0)).toBe(DEFAULT_COLUMN_WIDTH + 20);
  });

  test("filters competing pointer cancellation and cleans up lost capture and blur", async () => {
    const { session, wrapper } = mountSheetGrid();
    const handle = wrapper.get('[data-resize-column="0"]');
    await handle.trigger("pointerdown", {
      button: 0,
      pointerId: 7,
      clientX: DEFAULT_COLUMN_WIDTH,
    });
    dispatchPointer("pointermove", {
      buttons: 1,
      pointerId: 7,
      clientX: DEFAULT_COLUMN_WIDTH + 20,
    });
    dispatchPointer("pointercancel", { pointerId: 8 });
    await wrapper.vm.$nextTick();

    expect(wrapper.classes()).toContain("is-resizing-column");
    expect(
      wrapper.get('[data-column="0"].sheet-column-headers__item').attributes("style"),
    ).toContain("width: 116px");

    handle.element.dispatchEvent(createPointerEvent("lostpointercapture", { pointerId: 7 }));
    await wrapper.vm.$nextTick();
    expect(wrapper.classes()).not.toContain("is-resizing-column");
    expect(session.history.undoStack).toHaveLength(0);

    const rowHandle = wrapper.get('[data-resize-row="0"]');
    await rowHandle.trigger("pointerdown", {
      button: 0,
      pointerId: 9,
      clientY: DEFAULT_ROW_HEIGHT,
    });
    dispatchPointer("pointermove", {
      buttons: 1,
      pointerId: 9,
      clientY: DEFAULT_ROW_HEIGHT + 12,
    });
    await rowHandle.trigger("keydown", { key: "Escape" });
    expect(wrapper.classes()).not.toContain("is-resizing-row");
    expect(session.history.undoStack).toHaveLength(0);

    await rowHandle.trigger("pointerdown", {
      button: 0,
      pointerId: 10,
      clientY: DEFAULT_ROW_HEIGHT,
    });
    dispatchPointer("pointermove", {
      buttons: 1,
      pointerId: 10,
      clientY: DEFAULT_ROW_HEIGHT + 12,
    });
    window.dispatchEvent(new Event("blur"));
    await wrapper.vm.$nextTick();
    expect(wrapper.classes()).not.toContain("is-resizing-row");
    expect(session.history.undoStack).toHaveLength(0);
  });

  test("keeps edit drafts and clipboard state while resizing", async () => {
    const { session, sheet, wrapper } = mountSheetGrid();
    const editor = wrapper.get("textarea.cell-editor");
    const copied = createTestClipboardEvent("copy");
    editor.element.dispatchEvent(copied.event);
    await editor.trigger("keydown", { key: "F2" });
    await editor.setValue("draft");

    await wrapper.get('[data-resize-column="0"]').trigger("pointerdown", {
      button: 0,
      pointerId: 3,
      clientX: DEFAULT_COLUMN_WIDTH,
    });
    dispatchPointer("pointermove", {
      buttons: 1,
      pointerId: 3,
      clientX: DEFAULT_COLUMN_WIDTH + 20,
    });
    await wrapper.get("textarea.cell-editor").trigger("keydown", { key: "Escape" });
    await wrapper.vm.$nextTick();

    expect(wrapper.get("textarea.cell-editor").classes()).toContain("is-editing");
    expect((wrapper.get("textarea.cell-editor").element as HTMLTextAreaElement).value).toBe(
      "draft",
    );
    expect(wrapper.find("[data-clipboard-range]").exists()).toBe(true);
    expect(getColumnWidth(sheet, 0)).toBe(DEFAULT_COLUMN_WIDTH);
    expect(session.history.undoStack).toHaveLength(0);
  });

  test("resizes without committing an active IME composition", async () => {
    const { session, sheet, wrapper } = mountSheetGrid();
    const editor = wrapper.get("textarea.cell-editor");
    await editor.trigger("compositionstart");
    await editor.setValue("中文");

    await wrapper.get('[data-resize-row="0"]').trigger("pointerdown", {
      button: 0,
      pointerId: 6,
      clientY: DEFAULT_ROW_HEIGHT,
    });
    dispatchPointer("pointermove", {
      buttons: 1,
      pointerId: 6,
      clientY: DEFAULT_ROW_HEIGHT + 12,
    });
    dispatchPointer("pointerup", { pointerId: 6, clientY: DEFAULT_ROW_HEIGHT + 12 });
    await wrapper.vm.$nextTick();

    expect(getRowHeight(sheet, 0)).toBe(36);
    expect(getCellValue(sheet, { row: 0, column: 0 })).toBeNull();
    expect((wrapper.get("textarea.cell-editor").element as HTMLTextAreaElement).value).toBe("中文");
    expect(wrapper.get("textarea.cell-editor").classes()).toContain("is-editing");
    expect(session.history.undoStack).toHaveLength(1);
  });

  test("keeps headers and cells aligned after scrolling past a resized column", async () => {
    const { wrapper } = mountSheetGrid();
    await wrapper.get('[data-resize-column="0"]').trigger("pointerdown", {
      button: 0,
      pointerId: 4,
      clientX: DEFAULT_COLUMN_WIDTH,
    });
    dispatchPointer("pointermove", { buttons: 1, pointerId: 4, clientX: 140 });
    dispatchPointer("pointerup", { pointerId: 4, clientX: 140 });
    await wrapper.vm.$nextTick();

    const scroller = wrapper.get(".sheet-grid__scroller");
    (scroller.element as HTMLDivElement).scrollLeft = 100;
    await scroller.trigger("scroll");

    expect(
      wrapper.get('[data-column="1"].sheet-column-headers__item').attributes("style"),
    ).toContain("left: 40px");
    expect(wrapper.get('[data-row="0"][data-column="1"]').attributes("style")).toContain(
      "left: 140px",
    );
    // Cells retain sheet coordinates; their owning row pane applies the scroll offset.
    expect(
      wrapper.get('[data-row="0"][data-column="1"]').element.parentElement?.style.transform,
    ).toBe("translateX(-100px)");
  });
});
