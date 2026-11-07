// 未执行：按用户要求仅编写测试，不运行检查。
import { DOMWrapper, mount, shallowMount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, test, vi } from "vitest";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { applyWorkbookCommand, type WorkbookCommand } from "@sheetcraft/core/commands";
import { scatterStyles, type ScatterStyle } from "@sheetcraft/core/chart-presentation";
import type { SheetChartDrawing } from "@sheetcraft/core/sheet-drawings";
import {
  createWorkbook,
  createSheetEvaluator,
  getActiveSheet,
  setCellContent,
} from "@sheetcraft/core/workbook";
import ScatterInsertMenu from "../../../modules/charts/components/ScatterInsertMenu.vue";
import ChartInsertTools from "../../../modules/charts/components/ChartInsertTools.vue";
import ChartEditorDialog from "../../../modules/charts/components/ChartEditorDialog.vue";
import ChartTypeNavigation from "../../../modules/charts/components/ChartTypeNavigation.vue";
import type { ScatterInsertChoice } from "../../../modules/charts/chart-design-intents";
import { useChartActions } from "../../../modules/charts/useChartActions";
import RibbonSplitButton from "../../../shared/ribbon/RibbonSplitButton.vue";
import { createAppI18n } from "../../../shared/i18n";

const wrappers: VueWrapper[] = [];
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
});
function menu() {
  return new DOMWrapper(document.body).get('[role="menu"]');
}
function gallery(disabled = false) {
  const wrapper = mount(ScatterInsertMenu, {
    attachTo: document.body,
    props: { disabled },
    global: { plugins: [createAppI18n("en-US")] },
  });
  wrappers.push(wrapper);
  return wrapper;
}

describe("XY scatter insertion choices", () => {
  test.each([
    { family: "marker", style: "marker" },
    { family: "smooth", style: "smoothMarker" },
    { family: "smooth", style: "smooth" },
    { family: "line", style: "lineMarker" },
    { family: "line", style: "line" },
  ] as const)(
    "$family page emits the actual $style and theme accent after choosing a card",
    async ({ family, style }) => {
      const wrapper = gallery();
      wrapper.getComponent(RibbonSplitButton).vm.$emit("toggleMenu");
      await nextTick();
      expect(
        menu()
          .findAll("[data-scatter-family]")
          .map((item) => item.attributes("data-scatter-family")),
      ).toEqual(["marker", "smooth", "line"]);
      await menu().get(`[data-scatter-family="${family}"]`).trigger("click");
      expect(menu().get(`[data-scatter-family="${family}"]`).attributes("aria-pressed")).toBe(
        "true",
      );
      expect(wrapper.emitted("insert")).toBeUndefined();
      await menu().get(`[data-scatter-style="${style}"][data-scatter-accent="2"]`).trigger("click");
      expect(wrapper.emitted("insert")).toEqual([
        [{ type: "scatter", scatterStyle: style, accent: 2, followTheme: true }],
      ]);
      expect(document.body.querySelector('[role="menu"]')).toBeNull();
    },
  );

  test("turning off theme following emits a fixed-color choice and the main button keeps ordinary insertion", async () => {
    const wrapper = gallery();
    const trigger = wrapper.getComponent(RibbonSplitButton);
    trigger.vm.$emit("activate");
    expect(wrapper.emitted("insert")).toEqual([["scatter"]]);
    trigger.vm.$emit("toggleMenu");
    await nextTick();
    await menu().get('[data-scatter-family="line"]').trigger("click");
    wrapper.getComponent(Checkbox).vm.$emit("update:modelValue", false);
    await nextTick();
    await menu().get('[data-scatter-style="lineMarker"][data-scatter-accent="1"]').trigger("click");
    expect(wrapper.emitted("insert")!.at(-1)).toEqual([
      { type: "scatter", scatterStyle: "lineMarker", accent: 1, followTheme: false },
    ]);
  });

  test("a disabled insertion tool does not open or emit a scatter choice", async () => {
    const wrapper = gallery(true);
    wrapper.getComponent(RibbonSplitButton).vm.$emit("activate");
    wrapper.getComponent(RibbonSplitButton).vm.$emit("toggleMenu");
    await nextTick();
    expect(wrapper.emitted("insert")).toBeUndefined();
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
  });

  test("ChartInsertTools forwards the complete scatter choice unchanged", () => {
    const wrapper = shallowMount(ChartInsertTools, {
      props: { disabled: false },
      global: { plugins: [createAppI18n("en-US")] },
    });
    wrappers.push(wrapper);
    const choice: ScatterInsertChoice = {
      type: "scatter",
      scatterStyle: "smoothMarker",
      accent: 5,
      followTheme: true,
    };
    wrapper.getComponent(ScatterInsertMenu).vm.$emit("insert", choice);
    expect(wrapper.emitted("insert")).toEqual([[choice]]);
  });
});

function insertedEditor(style: ScatterStyle) {
  const workbook = createWorkbook({ id: "scatter-edit", sheetId: "sheet" });
  const sheet = getActiveSheet(workbook);
  [
    ["X", "Sales"],
    [1, 10],
    [2, 20],
    [3, 30],
  ].forEach((row, r) =>
    row.forEach((value, column) => {
      setCellContent(sheet, { row: r, column }, { kind: "literal", value });
    }),
  );
  const execute = vi.fn(
    (command: WorkbookCommand) => applyWorkbookCommand(workbook, command) !== null,
  );
  const actions = useChartActions({
    getWorkbook: () => workbook,
    getSheet: () => sheet,
    getRange: () => ({ start: { row: 0, column: 0 }, end: { row: 3, column: 1 } }),
    getEvaluator: () => createSheetEvaluator(sheet),
    isBusy: () => false,
    flush: () => true,
    execute,
    name: () => "XY scatter",
  });
  actions.insert({ type: "scatter", scatterStyle: style, accent: 2, followTheme: true });
  const insert = actions.dialog.value!;
  insert.confirm(insert.initial, "A1:B4");
  expect(execute).toHaveBeenCalledTimes(1);
  const saved = sheet.drawings![0] as SheetChartDrawing;
  actions.edit(saved);
  const edit = actions.dialog.value!;
  const wrapper = mount(ChartEditorDialog, {
    attachTo: document.body,
    props: {
      drawing: edit.initial,
      mode: "change-type",
      workbook,
      sheet,
      evaluator: createSheetEvaluator(sheet),
      revision: 0,
      disabled: false,
      error: false,
      suspended: false,
      selectReference: async () => undefined,
      onConfirm: (drawing: SheetChartDrawing, source: string) => edit.confirm(drawing, source),
    },
    global: { plugins: [createAppI18n("en-US")], stubs: { ChartContent: true } },
  });
  wrappers.push(wrapper);
  return { wrapper, actions, execute, saved, sheet };
}

describe("inserted XY scatter subtype editing", () => {
  test.each(scatterStyles)(
    "reopening inserted %s reflects its subtype and commits a changed variant",
    async (style) => {
      const f = insertedEditor(style);
      expect(
        f.wrapper
          .findAll("[data-scatter-variant]")
          .map((item) => item.attributes("data-scatter-variant")),
      ).toEqual(scatterStyles);
      expect(f.wrapper.get(`[data-scatter-variant="${style}"]`).attributes("aria-pressed")).toBe(
        "true",
      );
      const next = style === "line" ? "marker" : "line";
      await f.wrapper.get(`[data-scatter-variant="${next}"]`).trigger("click");
      expect(f.wrapper.get(`[data-scatter-variant="${next}"]`).attributes("aria-pressed")).toBe(
        "true",
      );
      expect(f.execute).toHaveBeenCalledTimes(1);
      f.wrapper.getComponent(Dialog).vm.$emit("confirm");
      await nextTick();
      expect(f.execute).toHaveBeenCalledTimes(2);
      expect((f.sheet.drawings![0] as SheetChartDrawing).chart.presentation).toMatchObject({
        scatterStyle: next,
        themeAccent: 2,
      });
      expect(f.saved.chart.presentation?.scatterStyle).toBe(style);
      expect(f.actions.dialog.value).toBeUndefined();
    },
  );

  test("changing the inserted chart away from scatter and back reflects marker-only and retires the old subtype", async () => {
    const f = insertedEditor("smoothMarker");
    f.wrapper.getComponent(ChartTypeNavigation).vm.$emit("select", "column");
    await nextTick();
    expect(f.wrapper.find("[data-scatter-variant]").exists()).toBe(false);
    f.wrapper.getComponent(ChartTypeNavigation).vm.$emit("select", "scatter");
    await nextTick();
    expect(f.wrapper.get('[data-scatter-variant="marker"]').attributes("aria-pressed")).toBe(
      "true",
    );
    f.wrapper.getComponent(Dialog).vm.$emit("confirm");
    await nextTick();
    const final = (f.sheet.drawings![0] as SheetChartDrawing).chart;
    expect(final.type).toBe("scatter");
    expect(final.presentation?.scatterStyle).toBeUndefined();
    expect(final.presentation?.themeAccent).toBe(2);
  });
});
