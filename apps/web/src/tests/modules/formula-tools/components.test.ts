import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import { createAppI18n } from "../../../shared/i18n";
import { getFormulaFunctionMetadata, parseFormula } from "@idea10/core/formula";
import { formulaFunctionCopyEnUS } from "../../../shared/formula-editing/function-catalog.en-US";
import { formulaFunctionCopyZhCN } from "../../../shared/formula-editing/function-catalog.zh-CN";
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
    props: { editSessionId: "edit-1", recentFunctions: ["IF"] },
  });
  mounted.push(wrapper);
  return wrapper;
}

describe("FormulaToolbar", () => {
  test("emits the primary aggregate and a category function without committing the edit session", async () => {
    const wrapper = mountToolbar();
    await wrapper.get("[data-ribbon-split-main]").trigger("click");
    expect(wrapper.emitted("aggregate")).toEqual([["SUM"]]);
    await wrapper.get(".formula-category-menu__trigger").trigger("click");
    const menu = document.querySelector<HTMLElement>(
      "[data-cell-edit-session='edit-1'] [data-formula-function]",
    );
    expect(menu).not.toBeNull();
    menu?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(wrapper.emitted("insertFunction")?.[0]?.[0]).toBeTruthy();
  });

  test("opens the function browser and inserts the selected function", async () => {
    const wrapper = mountToolbar();
    const actions = wrapper.findAll(".formula-toolbar__group--actions button");
    await actions[0]!.trigger("click");
    const browser = document.querySelector(".formula-function-browser");
    expect(browser?.getAttribute("data-cell-edit-session")).toBe("edit-1");
    const option = document.querySelector<HTMLButtonElement>(
      ".formula-function-browser__results button",
    );
    option?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(wrapper.emitted("insertFunction")?.[0]?.[0]).toBeTruthy();
    expect(wrapper.emitted("interactionEnd")).toHaveLength(1);
  });
});

test("provides localized function copy for every Core formula function", () => {
  const names = getFormulaFunctionMetadata().map((metadata) => metadata.name);
  expect(Object.keys(formulaFunctionCopyEnUS).sort()).toEqual(
    [...names].sort(),
  );
  expect(Object.keys(formulaFunctionCopyZhCN).sort()).toEqual(
    [...names].sort(),
  );
  for (const name of names) {
    expect(formulaFunctionCopyEnUS[name]?.description).toBeTruthy();
    expect(formulaFunctionCopyEnUS[name]?.signature).toMatch(
      new RegExp(`^${name}\\(`),
    );
    expect(formulaFunctionCopyEnUS[name]?.example).toMatch(/^=/);
    expect(formulaFunctionCopyZhCN[name]?.description).toBeTruthy();
    expect(formulaFunctionCopyZhCN[name]?.signature).toMatch(
      new RegExp(`^${name}\\(`),
    );
    expect(formulaFunctionCopyZhCN[name]?.example).toMatch(/^=/);
    expect(parseFormula(formulaFunctionCopyEnUS[name]!.example).ok, name).toBe(
      true,
    );
    expect(parseFormula(formulaFunctionCopyZhCN[name]!.example).ok, name).toBe(
      true,
    );
  }
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
    const inputs = wrapper.findAll("input");
    await inputs[0]!.setValue("Revenue");
    await inputs[1]!.setValue("Budget!A1:A5");
    await wrapper.find("form").trigger("submit");
    expect(wrapper.emitted("save")).toEqual([
      [{ name: "Revenue", scopeSheetId: "sheet-1", reference: "Budget!A1:A5" }],
    ]);
  });
});
