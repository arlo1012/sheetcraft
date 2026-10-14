import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { EquationMatrix } from "@sheetcraft/core/equation-document";
import EquationTools from "../../../../modules/sheet-drawings/equation/EquationTools.vue";
import {
  createEquationTemplate,
  EQUATION_STRUCTURE_CATEGORIES,
} from "../../../../modules/sheet-drawings/equation/equation-catalog";
import { createAppI18n } from "../../../../shared/i18n";

const mounted: VueWrapper[] = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
});
function fixture(overrides: Record<string, unknown> = {}) {
  const callbacks = {
    insertTemplate: vi.fn(() => true),
    insertSymbol: vi.fn(() => true),
    convertFraction: vi.fn(() => true),
    editMatrix: vi.fn(() => true),
    editSource: vi.fn(() => true),
    editNormalText: vi.fn(() => true),
    reloadStructured: vi.fn(() => true),
    hidePlaceholders: vi.fn(() => true),
    finish: vi.fn(() => true),
  };
  const wrapper = mount(EquationTools, {
    attachTo: document.body,
    props: {
      ownerId: "equation-a",
      sessionId: 1,
      sourceMode: "structured",
      ...callbacks,
      ...overrides,
    } as never,
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  return { wrapper, callbacks };
}
function item(selector: string): HTMLElement {
  const element = document.body.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`Missing equation control ${selector}`);
  return element;
}
async function click(selector: string) {
  item(selector).click();
  await nextTick();
  await flushPromises();
}
function matrix(rows = 2, columns = 2): EquationMatrix {
  let next = 0;
  const node = createEquationTemplate(`matrix-${rows}x${columns}`, () => `matrix-${++next}`);
  if (node.kind !== "matrix") throw new Error("Expected matrix template");
  return node;
}
describe("contextual Equation Tools ribbon", () => {
  test("renders ordered concrete galleries and Chinese labels using the shared ribbon", async () => {
    const { wrapper } = fixture({ locale: "zh-CN", ownerId: "中文公式", sessionId: 9 });
    expect(
      wrapper
        .findAll("[data-equation-structure]")
        .map((node) => node.attributes("data-equation-structure")),
    ).toEqual(EQUATION_STRUCTURE_CATEGORIES.map((category) => category.id));
    expect(wrapper.get("[data-equation-structure='fraction']").attributes("aria-label")).toBe(
      "分数",
    );
    expect(wrapper.get("[data-equation-structure='large-operator']").attributes("aria-label")).toBe(
      "大型运算符",
    );
    expect(wrapper.get("[data-equation-edit-source]").attributes("aria-label")).toBe(
      "编辑 LaTeX 源码",
    );
    expect(wrapper.find("[data-ribbon-rail]").exists()).toBe(true);
    await click("[data-equation-structure='matrix']");
    expect(item("[data-equation-structure-menu]").getAttribute("data-equation-owner")).toBe(
      "中文公式",
    );
    expect(item("[data-equation-structure-menu]").getAttribute("data-equation-session")).toBe("9");
    expect(item("[data-equation-structure-menu]").textContent).toContain("稀疏矩阵");
  });
  test("selects real fraction and nested-capable matrix templates and accepts applied-result objects", async () => {
    const insertTemplate = vi.fn(() => ({ accepted: true }));
    fixture({ insertTemplate });
    await click("[data-equation-structure='fraction']");
    await click("[data-equation-template='fraction-stacked']");
    expect(insertTemplate).toHaveBeenLastCalledWith("fraction-stacked");
    expect(document.querySelector("[data-equation-structure-menu]")).toBeNull();
    await click("[data-equation-structure='matrix']");
    await click("[data-equation-template='matrix-sparse-bracket']");
    expect(insertTemplate).toHaveBeenLastCalledWith("matrix-sparse-bracket");
  });
  test("eight symbol choices reveal the correct groups and insert command or literal payloads", async () => {
    const { callbacks } = fixture({ locale: "zh-CN" });
    await click("[data-equation-symbols-trigger]");
    await click("[data-equation-symbol-category]");
    expect(document.querySelectorAll("[data-equation-symbol-category-choice]")).toHaveLength(8);
    await click("[data-equation-symbol-category-choice='basic']");
    expect(item("[data-equation-symbol-menu]").getAttribute("data-equation-session")).toBe("1");
    await click("[data-equation-symbol='basic-0']");
    expect(callbacks.insertSymbol).toHaveBeenLastCalledWith({ kind: "text", value: "±" });
    await click("[data-equation-symbols-trigger]");
    await click("[data-equation-symbol-category]");
    await click("[data-equation-symbol-category-choice='scripts']");
    expect(item("[data-equation-symbol-menu]").textContent).toContain("哥特体");
    expect(item("[data-equation-symbol-menu]").textContent).toContain("双线体");
    await click("[data-equation-symbol='fraktur-0']");
    expect(callbacks.insertSymbol).toHaveBeenLastCalledWith({
      kind: "latex",
      value: "\\mathfrak{A}",
    });
  });
  test("inline symbols are real actions, with matching payloads and failure feedback", async () => {
    const insertSymbol = vi.fn(() => false);
    const { wrapper } = fixture({ insertSymbol });
    await click("[data-equation-inline-symbol='basic-0']");
    expect(insertSymbol).toHaveBeenCalledWith({ kind: "text", value: "±" });
    expect(wrapper.find('[role="alert"]').text()).toContain("could not be applied");
  });
  test("rejected template callbacks preserve menu and expose a retry", async () => {
    const insertTemplate = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    fixture({ insertTemplate });
    await click("[data-equation-structure='radical']");
    await click("[data-equation-template='radical-square']");
    expect(item("[data-equation-structure-menu]").textContent).toContain("could not be applied");
    await click("[data-equation-template='radical-square']");
    expect(insertTemplate).toHaveBeenCalledTimes(2);
    expect(document.querySelector("[data-equation-structure-menu]")).toBeNull();
  });
  test("old detached choice cannot act after closing and reopening the same gallery", async () => {
    const { callbacks } = fixture();
    await click("[data-equation-structure='fraction']");
    const old = item("[data-equation-template='fraction-stacked']");
    await click("[data-equation-structure='fraction']");
    await click("[data-equation-structure='fraction']");
    old.click();
    await flushPromises();
    expect(callbacks.insertTemplate).not.toHaveBeenCalled();
    expect(document.querySelector("[data-equation-structure-menu]")).not.toBeNull();
    await click("[data-equation-template='fraction-stacked']");
    expect(callbacks.insertTemplate).toHaveBeenCalledOnce();
  });
  test("owner/session changes invalidate removed rows, without dismissing a newly opened menu", async () => {
    const { wrapper, callbacks } = fixture();
    await click("[data-equation-structure='fraction']");
    const old = item("[data-equation-template='fraction-stacked']");
    await wrapper.setProps({ ownerId: "equation-b", sessionId: 2 });
    await click("[data-equation-structure='fraction']");
    old.click();
    await flushPromises();
    expect(callbacks.insertTemplate).not.toHaveBeenCalled();
    expect(item("[data-equation-structure-menu]").getAttribute("data-equation-owner")).toBe(
      "equation-b",
    );
  });
  test("pending old-owner result cannot close current-owner popup", async () => {
    let resolve!: (result: boolean) => void;
    const insertTemplate = vi.fn(
      () =>
        new Promise<boolean>((done) => {
          resolve = done;
        }),
    );
    const { wrapper } = fixture({ insertTemplate });
    await click("[data-equation-structure='fraction']");
    item("[data-equation-template='fraction-stacked']").click();
    await nextTick();
    expect(
      item("[data-equation-template='fraction-skewed']").getAttribute("disabled"),
    ).not.toBeNull();
    expect(document.querySelector("[data-equation-structure-menu]")).not.toBeNull();
    await wrapper.setProps({ ownerId: "equation-b", sessionId: 2 });
    await click("[data-equation-structure='matrix']");
    resolve(true);
    await flushPromises();
    expect(item("[data-equation-structure-menu]").getAttribute("data-equation-owner")).toBe(
      "equation-b",
    );
    expect(document.querySelector("[data-equation-template='matrix-2x2']")).not.toBeNull();
  });
  test("all disabled controls reject actual activation and close an existing menu", async () => {
    const { wrapper, callbacks } = fixture();
    await click("[data-equation-structure='fraction']");
    const old = item("[data-equation-template='fraction-stacked']");
    await wrapper.setProps({ disabled: true });
    old.click();
    await click("[data-equation-structure='fraction']");
    await click("[data-equation-finish]");
    expect(document.querySelector("[data-equation-structure-menu]")).toBeNull();
    expect(callbacks.insertTemplate).not.toHaveBeenCalled();
    expect(callbacks.finish).not.toHaveBeenCalled();
    expect(wrapper.get("[data-equation-structure='fraction']").attributes("aria-disabled")).toBe(
      "true",
    );
  });
  test("source mode disables structured choices while exposing restore/source/finish", async () => {
    const { wrapper, callbacks } = fixture({ sourceMode: "latex" });
    expect(wrapper.get("[data-equation-structure='fraction']").attributes("aria-disabled")).toBe(
      "true",
    );
    await click("[data-equation-structure='fraction']");
    await click("[data-equation-normal-text]");
    await click("[data-equation-reload]");
    await click("[data-equation-edit-source]");
    await click("[data-equation-finish]");
    expect(callbacks.insertTemplate).not.toHaveBeenCalled();
    expect(callbacks.editNormalText).not.toHaveBeenCalled();
    expect(callbacks.reloadStructured).toHaveBeenCalledOnce();
    expect(callbacks.editSource).toHaveBeenCalledOnce();
    expect(callbacks.finish).toHaveBeenCalledOnce();
    expect(wrapper.find('[role="status"]').text()).toContain("structured draft");
  });
  test("fraction option applies only to its captured node and preserves denominator semantics", async () => {
    let next = 0;
    const fraction = createEquationTemplate("fraction-stacked", () => `fraction-${++next}`);
    const { wrapper, callbacks } = fixture({ selectedStructure: fraction });
    await click("[data-equation-options-trigger]");
    const old = item("[data-equation-fraction-style='linear']");
    await click("[data-equation-fraction-style='skewed']");
    expect(callbacks.convertFraction).toHaveBeenLastCalledWith({
      nodeId: fraction.id,
      style: "skewed",
    });
    await wrapper.setProps({ selectedStructure: { ...fraction, id: "another-fraction" } });
    await click("[data-equation-options-trigger]");
    old.click();
    await flushPromises();
    expect(callbacks.convertFraction).toHaveBeenCalledOnce();
    await click("[data-equation-fraction-style='no-bar']");
    expect(callbacks.convertFraction).toHaveBeenLastCalledWith({
      nodeId: "another-fraction",
      style: "no-bar",
    });
  });
  test.each([
    ["row-before", "matrix-row", "insert", 1],
    ["row-after", "matrix-row", "insert", 2],
    ["column-before", "matrix-column", "insert", 1],
    ["column-after", "matrix-column", "insert", 2],
    ["delete-row", "matrix-row", "delete", 1],
    ["delete-column", "matrix-column", "delete", 1],
  ])("matrix %s captures selected row/column", async (action, type, operation, index) => {
    const selectedStructure = matrix();
    const { callbacks } = fixture({
      selectedStructure,
      selectedMatrixRow: 1,
      selectedMatrixColumn: 1,
    });
    await click("[data-equation-options-trigger]");
    await click(`[data-equation-matrix-action='${action}']`);
    expect(callbacks.editMatrix).toHaveBeenCalledWith({
      type,
      nodeId: selectedStructure.id,
      operation,
      index,
    });
  });
  test("matrix minimum and maximum sizes enforce actual disabled rows", async () => {
    const single: EquationMatrix = {
      ...matrix(),
      rows: [[{ id: "only-cell", kind: "sequence", children: [] }]],
    };
    const { wrapper, callbacks } = fixture({ selectedStructure: single });
    await click("[data-equation-options-trigger]");
    expect(item("[data-equation-matrix-action='delete-row']").getAttribute("aria-disabled")).toBe(
      "true",
    );
    await click("[data-equation-matrix-action='delete-row']");
    expect(callbacks.editMatrix).not.toHaveBeenCalled();
    await wrapper.setProps({
      selectedStructure: {
        ...single,
        id: "max-matrix",
        rows: Array.from({ length: 16 }, (_, row) =>
          Array.from({ length: 16 }, (_, column) => ({
            id: `${row}-${column}`,
            kind: "sequence" as const,
            children: [],
          })),
        ),
      },
    });
    await click("[data-equation-options-trigger]");
    expect(item("[data-equation-matrix-action='row-after']").getAttribute("aria-disabled")).toBe(
      "true",
    );
    expect(item("[data-equation-matrix-action='column-after']").getAttribute("aria-disabled")).toBe(
      "true",
    );
    await click("[data-equation-matrix-action='row-after']");
    expect(callbacks.editMatrix).not.toHaveBeenCalled();
  });
  test("matrix alignment and placeholder visibility use real explicit intents", async () => {
    const selectedStructure = matrix();
    const { callbacks } = fixture({ selectedStructure });
    await click("[data-equation-options-trigger]");
    await click("[data-equation-matrix-alignment='left']");
    expect(callbacks.editMatrix).toHaveBeenCalledWith({
      type: "matrix-alignment",
      nodeId: selectedStructure.id,
      alignment: "left",
    });
    await click("[data-equation-options-trigger]");
    await click("[data-equation-hide-placeholders]");
    expect(callbacks.hidePlaceholders).toHaveBeenCalledWith(true);
  });
  test("normal text, source and finish remain explicit operations; no full-equation converter", async () => {
    const { wrapper, callbacks } = fixture();
    await click("[data-equation-normal-text]");
    await click("[data-equation-edit-source]");
    await click("[data-equation-finish]");
    expect(callbacks.editNormalText).toHaveBeenCalledOnce();
    await wrapper.setProps({ normalTextActive: true });
    expect(wrapper.get("[data-equation-normal-text]").attributes("aria-pressed")).toBe("true");
    expect(callbacks.editSource).toHaveBeenCalledOnce();
    expect(callbacks.finish).toHaveBeenCalledOnce();
    expect(wrapper.text()).not.toContain("Professional");
    expect(wrapper.text()).not.toContain("UnicodeMath");
  });
  test("shared menu keyboard opening and roving focus remain functional", async () => {
    const { wrapper } = fixture();
    await wrapper
      .get("[data-equation-structure='fraction']")
      .trigger("keydown", { key: "ArrowDown" });
    await nextTick();
    await flushPromises();
    expect(document.activeElement?.getAttribute("data-equation-template")).toBe("fraction-stacked");
    item("[data-equation-template='fraction-stacked']").dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    );
    expect(document.activeElement?.getAttribute("data-equation-template")).toBe("fraction-skewed");
  });
});
