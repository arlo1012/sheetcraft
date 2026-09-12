import { flushPromises, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createAppI18n } from "../../../shared/i18n";
import {
  evaluateFormula,
  getFormulaFunctionMetadata,
  parseFormula,
  type FormulaEvaluationResolver,
  type FormulaValue,
} from "@idea10/core/formula";
import {
  formulaArgumentLabelsEnUS,
  formulaFunctionCopyEnUS,
} from "../../../shared/formula-editing/function-catalog.en-US";
import {
  formulaArgumentLabelsZhCN,
  formulaFunctionCopyZhCN,
} from "../../../shared/formula-editing/function-catalog.zh-CN";
import { getFormulaArgumentLabel } from "../../../shared/formula-editing/function-catalog";
import FormulaToolbar from "../../../modules/formula-tools/components/FormulaToolbar.vue";
import NamedRangesDialog from "../../../modules/formula-tools/components/NamedRangesDialog.vue";

const mounted: Array<{ unmount(): void }> = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  document.body.innerHTML = "";
});

function mountToolbar() {
  const wrapper = mount(FormulaToolbar, {
    attachTo: document.body,
    global: { plugins: [createAppI18n("en-US")] },
    props: {
      editSessionId: "edit-1",
      recentFunctions: ["IF"],
      nameCreationEnabled: true,
      calculationSettings: {
        mode: "automatic",
        iterative: false,
        maxIterations: 100,
        maxChange: 0.001,
      },
    },
  });
  mounted.push(wrapper);
  return wrapper;
}

describe("FormulaToolbar", () => {
  test("emits the primary aggregate and a category function without committing the edit session", async () => {
    const wrapper = mountToolbar();
    await wrapper.get('button[aria-label="AutoSum"]').trigger("click");
    expect(wrapper.emitted("aggregate")).toEqual([["SUM"]]);
    await wrapper.get(".formula-category-menu__trigger").trigger("click");
    await vi.waitFor(() =>
      expect(document.querySelector("[data-formula-function]")).not.toBeNull(),
    );
    const menu = document.querySelector<HTMLElement>(
      "[data-cell-edit-session='edit-1'] [data-formula-function]",
    );
    expect(menu).not.toBeNull();
    menu?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(wrapper.emitted("insertFunction")?.[0]?.[0]).toBeTruthy();
  });

  test("opens the function browser and inserts the selected function", async () => {
    const wrapper = mountToolbar();
    await wrapper.get('[aria-label="Insert function"]').trigger("click");
    const browser = document.querySelector(".formula-function-browser");
    expect(browser?.getAttribute("data-cell-edit-session")).toBe("edit-1");
    const option = document.querySelector<HTMLButtonElement>(
      ".formula-function-browser__results button",
    );
    option?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(wrapper.emitted("insertFunction")?.[0]?.[0]).toBeTruthy();
    expect(wrapper.emitted("interactionEnd")).toHaveLength(1);
  });

  test("focuses search, supports result keys, and closes on Escape", async () => {
    const wrapper = mountToolbar();
    await wrapper.get('[aria-label="Insert function"]').trigger("click");
    const search = document.querySelector<HTMLInputElement>(".formula-function-browser input");
    expect(document.activeElement).toBe(search);
    const result = document.querySelector<HTMLButtonElement>("[data-formula-browser-result]");
    result?.focus();
    result?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    await nextTick();
    expect(document.activeElement?.getAttribute("data-formula-browser-result")).toBeTruthy();
    document.querySelector(".formula-function-browser")?.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    );
    await nextTick();
    expect(document.querySelector(".formula-function-browser")).toBeNull();
    expect(wrapper.emitted("interactionEnd")).toHaveLength(1);
  });

  test("creates names from selected label edges and sends actual calculation settings", async () => {
    const wrapper = mountToolbar();
    await wrapper.get('[aria-label="Quick create"]').trigger("click");
    await vi.waitFor(() =>
      expect(document.querySelector("[data-formula-name-confirm]")).not.toBeNull(),
    );
    const left = document.querySelector<HTMLInputElement>(
      "[data-formula-name-position='left'] input",
    );
    left?.click();
    await nextTick();
    document
      .querySelector<HTMLElement>("[data-formula-name-confirm]")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(wrapper.emitted("createNamesFromSelection")).toEqual([[["top", "left"]]]);

    await wrapper.get('[aria-label="Calculation options"]').trigger("click");
    await vi.waitFor(() =>
      expect(document.querySelector(".formula-toolbar__calculation-menu")).not.toBeNull(),
    );
    const manual = document.querySelectorAll<HTMLInputElement>(
      ".formula-toolbar__calculation-menu input[type='radio']",
    )[1];
    manual?.closest("label")?.click();
    await nextTick();
    expect(wrapper.emitted("updateCalculationSettings")).toEqual([
      [{ mode: "manual", iterative: false, maxIterations: 100, maxChange: 0.001 }],
    ]);
  });
});

test("provides localized function copy for every Core formula function", () => {
  const names = getFormulaFunctionMetadata().map((metadata) => metadata.name);
  expect(Object.keys(formulaFunctionCopyEnUS).sort()).toEqual([...names].sort());
  expect(Object.keys(formulaFunctionCopyZhCN).sort()).toEqual([...names].sort());
  for (const name of names) {
    expect(formulaFunctionCopyEnUS[name]?.description).toBeTruthy();
    expect(formulaFunctionCopyEnUS[name]?.signature).toMatch(new RegExp(`^${name}\\(`));
    expect(formulaFunctionCopyEnUS[name]?.example).toMatch(/^=/);
    expect(formulaFunctionCopyZhCN[name]?.description).toBeTruthy();
    expect(formulaFunctionCopyZhCN[name]?.signature).toMatch(new RegExp(`^${name}\\(`));
    expect(formulaFunctionCopyZhCN[name]?.example).toMatch(/^=/);
    expect(parseFormula(formulaFunctionCopyEnUS[name]!.example).ok, name).toBe(true);
    expect(parseFormula(formulaFunctionCopyZhCN[name]!.example).ok, name).toBe(true);
  }
  for (const argument of getFormulaFunctionMetadata().flatMap((metadata) => metadata.arguments)) {
    expect(formulaArgumentLabelsEnUS[argument.name]).toBeTruthy();
    expect(formulaArgumentLabelsZhCN[argument.name]).toBeTruthy();
  }
  expect(
    getFormulaArgumentLabel("number", (key) => (key === "formulaArguments.number" ? "数值" : "")),
  ).toBe("数值");
});

test("function examples evaluate against a concrete sheet resolver", () => {
  const values = new Map<string, FormulaValue>([
    ["0:0", 2],
    ["1:0", 3],
    ["0:1", 4],
    ["1:1", 5],
  ]);
  const resolver: FormulaEvaluationResolver = {
    resolveCell: ({ row, column }) => values.get(`${row}:${column}`) ?? null,
    resolveRange: ({ start, end }) => {
      const result: FormulaValue[] = [];
      for (let row = start.row; row <= end.row; row += 1)
        for (let column = start.column; column <= end.column; column += 1)
          result.push(values.get(`${row}:${column}`) ?? null);
      return result;
    },
  };
  expect(evaluateFormula(formulaFunctionCopyEnUS.SUM!.example, resolver)).toBe(3);
  expect(evaluateFormula(formulaFunctionCopyEnUS.IF!.example, resolver)).toBe("Yes");
  expect(evaluateFormula(formulaFunctionCopyEnUS.AVERAGE!.example, resolver)).toBe(2);
  expect(evaluateFormula(formulaFunctionCopyEnUS.LEN!.example, resolver)).toBe(4);
  expect(evaluateFormula(formulaFunctionCopyEnUS.DATE!.example, resolver)).toBeTypeOf("number");
  expect(evaluateFormula(formulaFunctionCopyEnUS.FV!.example, resolver)).toBeTypeOf("number");
  expect(evaluateFormula(formulaFunctionCopyEnUS.BIN2DEC!.example, resolver)).toBe(5);
});

describe("NamedRangesDialog", () => {
  test("saves a workbook or sheet-scoped range using the typed row contract", async () => {
    const wrapper = mount(NamedRangesDialog, {
      global: { plugins: [createAppI18n("en-US")] },
      props: {
        visible: true,
        ranges: [],
        sheets: [{ id: "sheet-1", name: "Budget" }],
        activeSheetId: "sheet-1",
        selectionReference: "Budget!A1:A5",
        editSessionId: "edit-1",
      },
    });
    mounted.push(wrapper);
    await wrapper.get("[data-formula-name] input").setValue("Revenue");
    await wrapper.get("[data-formula-reference] input").setValue("Budget!A1:A5");
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(wrapper.emitted("save")).toEqual([
      [{ name: "Revenue", scopeSheetId: "sheet-1", reference: "Budget!A1:A5" }],
    ]);
  });
});
