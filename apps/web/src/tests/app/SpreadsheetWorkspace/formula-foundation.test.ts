import { defineComponent, h } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createFormulaError } from "@idea10/core/formula";
import { createSequentialIdFactory } from "@idea10/core/runtime";
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
  setCellContent,
} from "@idea10/core/workbook";
import SpreadsheetWorkspace from "../../../app/SpreadsheetWorkspace.vue";
import { useSpreadsheetWorkspaceController } from "../../../app/composables/useSpreadsheetWorkspaceController";
import WorkbookFileActions from "../../../modules/workbook-persistence/components/WorkbookFileActions.vue";
import type { WorkbookStore } from "../../../modules/workbook-persistence/workbookStore";
import { formatCellValueForGrid } from "../../../modules/sheet-grid/cell-value-presentation";
import { triggerCanvasCell } from "../canvas-interaction";
import { createAppI18n } from "../../../shared/i18n";

type Controller = ReturnType<typeof useSpreadsheetWorkspaceController>;

const mounted: Array<{ unmount(): void }> = [];

function createFormulaFoundationSnapshot(): WorkbookSnapshot {
  const workbook = createWorkbook({
    idFactory: createSequentialIdFactory(),
    dateSystem: "1904",
  });
  const sheet = getActiveSheet(workbook);
  setCellContent(
    sheet,
    { row: 0, column: 0 },
    {
      kind: "error",
      error: createFormulaError("NA"),
    },
  );
  setCellContent(sheet, { row: 0, column: 1 }, { kind: "literal", value: "" });
  setCellContent(sheet, { row: 0, column: 2 }, { kind: "literal", value: "#N/A" });
  setCellContent(
    sheet,
    { row: 0, column: 3 },
    {
      kind: "error",
      error: createFormulaError("NAME"),
    },
  );
  setCellContent(
    sheet,
    { row: 0, column: 4 },
    {
      kind: "formula",
      formula: { source: "=sum(1, 2)" },
    },
  );
  return serializeWorkbook(workbook);
}

function createStore(snapshot: WorkbookSnapshot) {
  return {
    load: vi.fn(async () => ({ revision: 1, savedAt: 1, snapshot })),
    save: vi.fn(async (_snapshot: WorkbookSnapshot, revision: number | undefined) => ({
      revision: (revision ?? 0) + 1,
      savedAt: 2,
    })),
    replace: vi.fn(async (_snapshot: WorkbookSnapshot) => ({
      revision: 2,
      savedAt: 2,
    })),
  } satisfies WorkbookStore;
}

async function mountWorkspace(store: ReturnType<typeof createStore>) {
  const wrapper = mount(SpreadsheetWorkspace, {
    attachTo: document.body,
    props: { workbookStore: store },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  await flushPromises();
  return wrapper;
}

function mountController(): Controller {
  let controller: Controller | undefined;
  const wrapper = mount(
    defineComponent({
      setup() {
        controller = useSpreadsheetWorkspaceController({
          idFactory: createSequentialIdFactory(),
        });
        return () => h("div");
      },
    }),
    { global: { plugins: [createAppI18n("en-US")] } },
  );
  mounted.push(wrapper);
  if (!controller) throw new Error("Workspace controller did not initialize.");
  return controller;
}

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
});

describe("SpreadsheetWorkspace formula foundation", () => {
  test("loads, displays, and saves V4 typed formula values without collapsing their meanings", async () => {
    const store = createStore(createFormulaFoundationSnapshot());
    const wrapper = await mountWorkspace(store);

    expect(wrapper.find("[data-sheet-canvas]").exists()).toBe(true);

    await triggerCanvasCell(wrapper, { row: 1, column: 5 }, "mousedown", { button: 0 });

    const editor = wrapper.get<HTMLTextAreaElement>("textarea.cell-editor");
    await editor.trigger("keydown", { key: "m" });
    await editor.setValue("save marker");
    await editor.trigger("keydown", { key: "s", ctrlKey: true });
    await flushPromises();

    const savedSnapshot = store.save.mock.calls[0]?.[0];
    expect(savedSnapshot).toMatchObject({ version: 14, dateSystem: "1904" });
    const restored = deserializeWorkbook(savedSnapshot);
    const sheet = getActiveSheet(restored);
    expect(restored.dateSystem).toBe("1904");
    expect(getCellContent(sheet, { row: 0, column: 0 })).toEqual({
      kind: "error",
      error: { kind: "formula-error", code: "NA" },
    });
    expect(getCellContent(sheet, { row: 0, column: 1 })).toEqual({
      kind: "literal",
      value: "",
    });
    expect(getCellContent(sheet, { row: 0, column: 2 })).toEqual({
      kind: "literal",
      value: "#N/A",
    });
    expect(getCellContent(sheet, { row: 0, column: 3 })).toEqual({
      kind: "error",
      error: { kind: "formula-error", code: "NAME" },
    });
    expect(getCellContent(sheet, { row: 0, column: 4 })).toEqual({
      kind: "formula",
      formula: { source: "=sum(1, 2)" },
    });
  });

  test("preserves typed formula errors through a rich all-cells clipboard payload", () => {
    const controller = mountController();
    const sheet = controller.activeSheet.value;
    const source = { row: 0, column: 0 };
    const target = { row: 2, column: 2 };
    setCellContent(sheet, source, {
      kind: "error",
      error: createFormulaError("NA"),
    });

    expect(
      controller.pasteCells({
        kind: "all",
        plan: {
          anchor: target,
          range: { start: target, end: target },
          values: [["#N/A"]],
        },
        contents: [[{ kind: "error", error: createFormulaError("NA") }]],
        sourceRange: { start: source, end: source },
      }),
    ).toEqual({ ok: true });
    expect(getCellContent(sheet, target)).toEqual({
      kind: "error",
      error: { kind: "formula-error", code: "NA" },
    });
    expect(formatCellValueForGrid(getCellComputedValue(sheet, target), undefined, "en-US")).toBe(
      "#N/A",
    );
  });

  test("rejects malformed V4 JSON before it replaces the loaded document", async () => {
    const safeSnapshot = createFormulaFoundationSnapshot();
    const store = createStore(safeSnapshot);
    const wrapper = await mountWorkspace(store);
    const malformed = structuredClone(safeSnapshot) as Record<string, unknown>;
    const sheet = (malformed.sheets as Array<Record<string, unknown>>)[0]!;
    const cells = sheet.cells as Array<Record<string, unknown>>;
    cells[0] = {
      ...cells[0],
      content: {
        kind: "error",
        error: { kind: "formula-error", code: "NOT_A_REAL_CODE" },
      },
    };

    wrapper.findComponent(WorkbookFileActions).vm.$emit("importJson", {
      text: async () => JSON.stringify(malformed),
    });
    await flushPromises();

    expect(store.replace).not.toHaveBeenCalled();
    expect(wrapper.find("[data-sheet-canvas]").exists()).toBe(true);

    expect(wrapper.get('[data-workbook-file="feedback"]').attributes("aria-label")).toContain(
      "not a valid idea10 workbook",
    );
  });
});
