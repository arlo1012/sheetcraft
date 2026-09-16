import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createSequentialIdFactory } from "@idea10/core/runtime";
import { serializeWorkbook, type WorkbookSnapshot } from "@idea10/core/serialization";
import { createWorkbook, getActiveSheet, setCellValue } from "@idea10/core/workbook";
import SpreadsheetWorkspace from "../../../app/SpreadsheetWorkspace.vue";
import WorkbookFileActions from "../../../modules/workbook-persistence/components/WorkbookFileActions.vue";
import WorkbookFileFeedback from "../../../modules/workbook-persistence/components/WorkbookFileFeedback.vue";
import type { WorkbookStore } from "../../../modules/workbook-persistence/workbookStore";
import { createAppI18n } from "../../../shared/i18n";

const mounted: Array<{ unmount(): void }> = [];

function snapshotWithValue(value: string): WorkbookSnapshot {
  const workbook = createWorkbook({ idFactory: createSequentialIdFactory() });
  setCellValue(getActiveSheet(workbook), { row: 0, column: 0 }, value);
  return serializeWorkbook(workbook);
}

function createStore(snapshot?: WorkbookSnapshot) {
  return {
    load: vi.fn(async () => (snapshot ? { revision: 1, savedAt: 1, snapshot } : undefined)),
    save: vi.fn(async (_snapshot: WorkbookSnapshot, revision: number | undefined) => ({
      revision: (revision ?? 0) + 1,
      savedAt: 2,
    })),
    replace: vi.fn(async (_snapshot: WorkbookSnapshot) => ({ revision: 2, savedAt: 2 })),
  } satisfies WorkbookStore;
}

async function mountWorkspace(store = createStore()) {
  const wrapper = mount(SpreadsheetWorkspace, {
    props: { workbookStore: store },
    attachTo: document.body,
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  await flushPromises();
  return wrapper;
}

function activeCellAddress(
  wrapper: Awaited<ReturnType<typeof mountWorkspace>>,
): string | undefined {
  return wrapper.get("textarea.cell-editor").attributes("data-cell-editor");
}

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
});

describe("workspace persistence integration", () => {
  test("saves the pending grid draft with Ctrl+S without moving the selection", async () => {
    const store = createStore();
    const wrapper = await mountWorkspace(store);
    const editor = wrapper.get<HTMLTextAreaElement>("textarea.cell-editor");
    await editor.trigger("keydown", { key: "d" });
    await editor.setValue("draft");
    await editor.trigger("keydown", { key: "s", ctrlKey: true });
    await flushPromises();

    expect(store.save).toHaveBeenCalledTimes(1);
    expect(store.save.mock.calls[0]![0]).toMatchObject({
      sheets: [{ cells: [{ content: { kind: "literal", value: "draft" } }] }],
    });
    expect(activeCellAddress(wrapper)).toBe("A1");
    expect(wrapper.get("[data-save-status]").attributes("data-save-status")).toBe("saved");
  });

  test("saves the current formula-bar draft and waits for IME composition to finish", async () => {
    const store = createStore();
    const wrapper = await mountWorkspace(store);
    const formula = wrapper.get<HTMLTextAreaElement>("[data-formula-input]");
    await formula.trigger("focus");
    await formula.trigger("compositionstart");
    await formula.setValue("中文");
    await formula.trigger("keydown", { key: "s", metaKey: true });
    await flushPromises();

    expect(store.save).not.toHaveBeenCalled();
    expect(wrapper.get('[data-workbook-file="feedback"]').attributes("aria-label")).toContain(
      "composition",
    );

    await formula.trigger("compositionend", { data: "中文" });
    await formula.trigger("keydown", { key: "s", metaKey: true });
    await flushPromises();
    expect(store.save.mock.calls[0]![0]).toMatchObject({
      sheets: [{ cells: [{ content: { kind: "literal", value: "中文" } }] }],
    });
  });

  test("confirms import before replacing the same sheet ID and resets old view state", async () => {
    const store = createStore(snapshotWithValue("original"));
    const wrapper = await mountWorkspace(store);
    const address = wrapper.get<HTMLInputElement>("[data-address-input]");
    await address.setValue("C3");
    await wrapper.get('[aria-label="Go to cell"]').trigger("submit");
    expect(activeCellAddress(wrapper)).toBe("C3");
    const file = { text: async () => JSON.stringify(snapshotWithValue("imported")) };
    wrapper.findComponent(WorkbookFileActions).vm.$emit("importJson", file);
    await flushPromises();

    expect(store.replace).not.toHaveBeenCalled();
    expect(wrapper.findComponent(WorkbookFileFeedback).props("confirmation")).toBe("import");
    wrapper.findComponent(WorkbookFileFeedback).vm.$emit("confirm");
    await flushPromises();

    expect(store.replace).toHaveBeenCalledTimes(1);
    expect(activeCellAddress(wrapper)).toBe("A1");
    expect(wrapper.find("[data-sheet-canvas]").exists()).toBe(true);
    expect(wrapper.get<HTMLTextAreaElement>("[data-formula-input]").element.value).toBe("imported");
    expect(wrapper.find('[data-workbook-file="feedback"]').exists()).toBe(false);
  });

  test("invalid snapshots leave the current document and saved record untouched", async () => {
    const store = createStore(snapshotWithValue("safe"));
    const wrapper = await mountWorkspace(store);
    wrapper.findComponent(WorkbookFileActions).vm.$emit("importJson", {
      text: async () => JSON.stringify({ version: 999 }),
    });
    await flushPromises();

    expect(store.replace).not.toHaveBeenCalled();
    expect(wrapper.findComponent(WorkbookFileFeedback).props("confirmation")).toBeUndefined();
    expect(wrapper.get<HTMLTextAreaElement>("[data-formula-input]").element.value).toBe("safe");
    expect(wrapper.get('[data-workbook-file="feedback"]').attributes("aria-label")).toContain(
      "unsupported version",
    );
  });
});
