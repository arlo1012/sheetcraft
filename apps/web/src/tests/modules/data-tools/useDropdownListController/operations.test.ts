import { defineComponent, nextTick, reactive, ref } from "vue";
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  redoWorkbookCommand,
  undoWorkbookCommand,
} from "@sheetcraft/core/history";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import {
  createSheet,
  getActiveSheet,
  setCellContent,
  type CellRange,
  type SheetDataValidation,
} from "@sheetcraft/core/workbook";
import { createAppI18n } from "../../../../shared/i18n";
import { useDropdownListController } from "../../../../modules/data-tools/useDropdownListController";

const wrappers: Array<{ unmount(): void }> = [];
afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()));

const range = (startRow: number, startColumn: number, endRow = startRow, endColumn = startColumn) =>
  ({
    start: { row: startRow, column: startColumn },
    end: { row: endRow, column: endColumn },
  }) as CellRange;

function list(
  id: string,
  coverage: CellRange,
  items: string[],
  extra: Partial<SheetDataValidation> = {},
) {
  return {
    id,
    range: coverage,
    type: "list" as const,
    list: items,
    allowBlank: true,
    showDropdown: true,
    ...extra,
  };
}

function fixture(initialRules: SheetDataValidation[] = []) {
  const session = reactive(createWorkbookSession({ idFactory: createSequentialIdFactory() }));
  const sheet = getActiveSheet(session.workbook);
  sheet.dataValidations = initialRules;
  const selection = ref({ range: range(0, 0) });
  const generation = ref(0);
  const busy = ref(false);
  let controller!: ReturnType<typeof useDropdownListController>;
  const wrapper = mount(
    defineComponent({
      setup() {
        controller = useDropdownListController({
          getWorkbook: () => session.workbook,
          getSelection: () => selection.value,
          getGeneration: () => generation.value,
          isBusy: () => busy.value,
          flush: () => true,
          execute: (command) => executeWorkbookCommand(session, command),
          focusSheet: () => undefined,
        });
        return () => null;
      },
    }),
    { global: { plugins: [createAppI18n("en-US")] } },
  );
  wrappers.push(wrapper);
  return { session, sheet, selection, generation, busy, controller };
}

const manual = (items: string[], overrides = {}) => ({
  mode: "manual" as const,
  items,
  source: "",
  applyToMatching: false,
  clear: false,
  ...overrides,
});

describe("dropdown list controller", () => {
  test("stores manual options exactly, keeps cell contents intact, and undo/redo is one Core action", () => {
    const f = fixture();
    setCellContent(f.sheet, { row: 0, column: 0 }, { kind: "literal", value: "keep" });
    setCellContent(f.sheet, { row: 1, column: 0 }, { kind: "literal", value: 42 });
    f.selection.value = { range: range(0, 0, 1, 0) };

    f.controller.openDropdownList();
    f.controller.applyDropdownList(manual(["North, East", "West", "North, East"]));

    expect(f.sheet.dataValidations).toHaveLength(1);
    expect(f.sheet.dataValidations![0]).toMatchObject({
      range: range(0, 0, 1, 0),
      list: ["North, East", "West", "North, East"],
    });
    expect(f.sheet.cells.get("0:0")?.content).toEqual({ kind: "literal", value: "keep" });
    expect(f.sheet.cells.get("1:0")?.content).toEqual({ kind: "literal", value: 42 });
    expect(f.session.history.undoStack).toHaveLength(1);

    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(f.sheet.dataValidations).toEqual([]);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    expect(f.sheet.dataValidations![0]?.list).toEqual(["North, East", "West", "North, East"]);
  });

  test("accepts cross-sheet and named range list sources while retaining their entered references", () => {
    const f = fixture();
    const other = createSheet("List source", "other");
    f.session.workbook.sheets.set(other.id, other);
    f.session.workbook.definedNames.set("workbook:CHOICES", {
      id: "workbook:CHOICES",
      name: "Choices",
      reference: { sheetId: other.id, start: { row: 1, column: 1 }, end: { row: 3, column: 1 } },
    });

    f.controller.openDropdownList();
    f.controller.applyDropdownList({ ...manual([]), mode: "range", source: "'List source'!B2:B4" });
    expect(f.sheet.dataValidations![0]?.formula1).toBe("='List source'!B2:B4");

    f.selection.value = { range: range(0, 1) };
    f.controller.openDropdownList();
    f.controller.applyDropdownList({ ...manual([]), mode: "range", source: "=Choices" });
    expect(f.sheet.dataValidations![1]?.formula1).toBe("=Choices");
  });

  test("replaces only the edited subrange and preserves the remaining list coverage", () => {
    const f = fixture([list("original", range(0, 0, 4, 0), ["old"])]);
    f.selection.value = { range: range(2, 0) };

    f.controller.openDropdownList();
    f.controller.applyDropdownList(manual(["new"]));

    expect(f.sheet.dataValidations).toHaveLength(3);
    expect(f.sheet.dataValidations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ range: range(0, 0, 1, 0), list: ["old"] }),
        expect.objectContaining({ range: range(2, 0), list: ["new"] }),
        expect.objectContaining({ range: range(3, 0, 4, 0), list: ["old"] }),
      ]),
    );
  });

  test("applies to matching list rules on this sheet only and leaves different settings unchanged", () => {
    const matching = list("matching", range(0, 1, 1, 1), ["old"]);
    const different = list("different", range(0, 2, 1, 2), ["old"], { allowBlank: false });
    const f = fixture([list("selected", range(0, 0, 1, 0), ["old"]), matching, different]);
    const other = createSheet("Other", "other");
    other.dataValidations = [list("other-list", range(0, 0), ["old"])];
    f.session.workbook.sheets.set(other.id, other);

    f.controller.openDropdownList();
    expect(f.controller.dropdownListInitial.value.canApplyToMatching).toBe(true);
    f.controller.applyDropdownList(manual(["new"], { applyToMatching: true }));

    expect(f.sheet.dataValidations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ range: range(0, 0, 1, 0), list: ["new"] }),
        expect.objectContaining({ range: range(0, 1, 1, 1), list: ["new"] }),
        expect.objectContaining({ id: "different", range: range(0, 2, 1, 2), list: ["old"] }),
      ]),
    );
    expect(other.dataValidations![0]?.list).toEqual(["old"]);
  });

  test("cancelling does not mutate rules, while applying clear removes list coverage only", () => {
    const whole: SheetDataValidation = {
      id: "whole",
      range: range(0, 1),
      type: "whole",
      allowBlank: false,
      formula1: "1",
      formula2: "10",
    };
    const f = fixture([list("list", range(0, 0), ["old"]), whole]);
    const before = JSON.parse(JSON.stringify(f.sheet.dataValidations));

    f.controller.openDropdownList();
    f.controller.closeDropdownList();
    expect(f.sheet.dataValidations).toEqual(before);

    f.controller.openDropdownList();
    f.controller.applyDropdownList(manual([], { clear: true }));
    expect(f.sheet.dataValidations).toEqual([whole]);
  });

  test("rejects protected, stale-generation, and externally changed validation targets without mutation", async () => {
    const f = fixture([list("list", range(0, 0), ["old"])]);
    f.sheet.properties.protected = true;
    f.controller.openDropdownList();
    expect(f.controller.dropdownListVisible.value).toBe(false);

    f.sheet.properties.protected = false;
    f.controller.openDropdownList();
    f.generation.value += 1;
    await nextTick();
    expect(f.controller.dropdownListVisible.value).toBe(false);

    f.controller.openDropdownList();
    f.sheet.dataValidations![0]!.list = ["changed elsewhere"];
    f.controller.applyDropdownList(manual(["new"]));
    expect(f.controller.dropdownListVisible.value).toBe(true);
    expect(f.controller.dropdownListError.value).not.toBe("");
    expect(f.sheet.dataValidations![0]?.list).toEqual(["changed elsewhere"]);
  });
});
