import { DOMWrapper, mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import SpreadsheetRibbon from "../../../app/SpreadsheetRibbon.vue";
import { createDefaultSelectionCellStyleState } from "@idea10/core/style-state";
import { createAppI18n } from "../../../shared/i18n";
import type {
  HomeDataToolState,
  MergeCellsState,
} from "../../../modules/home-tools/components/data-tool-state";

function mountRibbon(
  locale: "en-US" | "zh-CN" = "en-US",
  toolState?: { dataState?: HomeDataToolState; mergeState?: MergeCellsState },
) {
  return mount(SpreadsheetRibbon, {
    global: { plugins: [createAppI18n(locale)] },
    props: {
      state: createDefaultSelectionCellStyleState(),
      disabled: false,
      ...toolState,
    },
  });
}

describe("SpreadsheetRibbon", () => {
  test("exposes implemented categories and concrete Home tools", async () => {
    const wrapper = mountRibbon();

    expect(wrapper.get("header").attributes("aria-label")).toBe("Workbook tools");
    expect(wrapper.get("nav").attributes("aria-label")).toBe("Ribbon categories");
    expect(wrapper.get('[data-ribbon-category="home"]').text()).toBe("Home");
    expect(wrapper.findAll(".spreadsheet-ribbon__category")).toHaveLength(6);
    expect(wrapper.get(".spreadsheet-ribbon__panel").attributes("aria-labelledby")).toBe(
      wrapper.get('[data-ribbon-category="home"]').attributes("id"),
    );
    expect(wrapper.get(".home-format-toolbar").attributes("aria-label")).toBe("Cell formatting");
    expect(
      wrapper.get("[data-ribbon-tools] > [data-ribbon-scroll-viewport] > [data-ribbon-rail]"),
    ).toBeTruthy();
    expect(
      new Set(
        wrapper
          .get("[data-ribbon-tools]")
          .findAll("[data-ribbon-row]")
          .map((row) => row.attributes("data-ribbon-row")),
      ),
    ).toEqual(new Set(["1", "2"]));
    expect(
      wrapper
        .get('[data-ribbon-group="cell"]')
        .findAll(":scope > [data-ribbon-row]")
        .map((row) => row.attributes("data-ribbon-row")),
    ).toEqual(["1", "2"]);
    const cellGroup = wrapper.get('[data-ribbon-group="cell"]');
    expect(cellGroup.get(':scope > [data-ribbon-row="1"] [data-font-format-control]')).toBeTruthy();
    expect(cellGroup.get(':scope > [data-ribbon-row="1"] [data-cell-border-control]')).toBeTruthy();
    expect(cellGroup.get(':scope > [data-ribbon-row="2"] .text-format-controls')).toBeTruthy();
    expect(
      cellGroup.get(':scope > [data-ribbon-row="2"] [data-cell-color-control="text"]'),
    ).toBeTruthy();
    expect(
      cellGroup.get(':scope > [data-ribbon-row="2"] [data-cell-color-control="fill"]'),
    ).toBeTruthy();
    expect(cellGroup.get(':scope > [data-ribbon-dialog-launcher="font"]')).toBeTruthy();
    expect(wrapper.get('[data-ribbon-group="history"] [data-ribbon-row="2"]')).toBeTruthy();
    expect(wrapper.get("[data-locale-select] input").element).toBeInstanceOf(HTMLInputElement);

    await wrapper.get('[aria-label="Bold"]').trigger("click");
    expect(wrapper.emitted("applyStyle")?.[0]).toEqual([{ bold: true }]);

    const autoSum = wrapper.get('[data-ribbon-action="auto-sum"]');
    expect(autoSum.attributes()).toMatchObject({
      type: "button",
      "aria-label": "AutoSum",
    });
    expect((autoSum.element as HTMLButtonElement).disabled).toBe(false);
    await autoSum.trigger("click");
    expect(wrapper.emitted("autoSum")).toEqual([[]]);

    await wrapper.get("[data-cell-border-control] [data-ribbon-split-menu]").trigger("click");
    await new DOMWrapper(document.body).get('[data-border-preset="outer"]').trigger("click");
    expect(wrapper.emitted("applyBorders")?.[0]).toEqual([
      { preset: "outer", border: { style: "thin", color: "#20242c" } },
    ]);

    await wrapper.get("[data-cell-border-control] [data-ribbon-split-menu]").trigger("click");
    await new DOMWrapper(document.body).get('[data-border-menu-row="style"]').trigger("click");
    await new DOMWrapper(document.body)
      .get('[data-border-line-option="mediumDashDot"]')
      .trigger("click");
    expect(wrapper.emitted("updateBorderFormat")?.[0]).toEqual([{ style: "mediumDashDot" }]);

    await new DOMWrapper(document.body).get('[data-border-menu-row="color"]').trigger("click");
    await new DOMWrapper(document.body).get('[data-color-swatch="#4472c4"]').trigger("click");
    expect(wrapper.emitted("updateBorderFormat")?.[1]).toEqual([{ color: "#4472c4" }]);

    await new DOMWrapper(document.body).get('[data-border-menu-row="settings"]').trigger("click");
    expect(wrapper.emitted("openCellFormat")).toEqual([["border"]]);
  });

  test("forwards number conversion for large selections and blocks it in read-only mode", async () => {
    const wrapper = mountRibbon();
    await wrapper.setProps({ disabled: true, readOnly: false });
    const convert = wrapper.get('[data-ribbon-action="convert-number"]');
    expect(convert.attributes("disabled")).toBeUndefined();
    await convert.trigger("click");
    await new DOMWrapper(document.body)
      .get('[data-number-conversion="text-to-number"]')
      .trigger("click");
    expect(wrapper.emitted("convertNumberType")).toEqual([["text-to-number"]]);
    await wrapper.setProps({ readOnly: true });
    expect(convert.attributes("disabled")).toBe("");
  });

  test("keeps concrete history actions and unavailable placeholders in the ribbon", async () => {
    const wrapper = mountRibbon();

    await wrapper.get('[data-ribbon-action="undo"]').trigger("click");
    await wrapper.get('[data-ribbon-action="redo"]').trigger("click");

    expect(wrapper.emitted("undo")).toHaveLength(1);
    expect(wrapper.emitted("redo")).toHaveLength(1);
    expect(wrapper.findAll("[data-vertical-alignment-action]")).toHaveLength(3);
    const clearFormatting = wrapper.get('[data-ribbon-action="clear-formatting"]');
    expect(clearFormatting.element).toBeInstanceOf(HTMLButtonElement);
    expect(clearFormatting.attributes("type")).toBe("button");
    expect(clearFormatting.attributes("disabled")).toBeUndefined();
    expect(wrapper.get('[data-ribbon-action="wrap-text"]').attributes("aria-pressed")).toBe(
      "false",
    );
    expect(wrapper.findAll("[data-ribbon-placeholder]")).toHaveLength(9);
    expect(
      wrapper.get('[data-ribbon-action="conditional-formatting"]').attributes("disabled"),
    ).toBeUndefined();
    for (const placeholder of wrapper.findAll("[data-ribbon-placeholder]")) {
      expect(placeholder.element).toBeInstanceOf(HTMLButtonElement);
      expect(placeholder.attributes()).toMatchObject({
        type: "button",
        disabled: "",
      });
    }
  });

  test("keeps AutoSum available when formatting is disabled for a large selection", async () => {
    const wrapper = mountRibbon();
    await wrapper.setProps({ disabled: true });

    expect((wrapper.get('[aria-label="Bold"]').element as HTMLButtonElement).disabled).toBe(true);
    const formatLaunchers = wrapper.findAll("[data-ribbon-dialog-launcher]");
    expect(formatLaunchers).toHaveLength(3);
    for (const launcher of formatLaunchers) {
      expect((launcher.element as HTMLButtonElement).disabled).toBe(true);
      await launcher.trigger("click");
    }
    expect(wrapper.emitted("openCellFormat")).toBeUndefined();
    const autoSum = wrapper.get('[data-ribbon-action="auto-sum"]');
    expect((autoSum.element as HTMLButtonElement).disabled).toBe(false);
    await autoSum.trigger("click");
    expect(wrapper.emitted("autoSum")).toEqual([[]]);
  });

  test("forwards concrete data and merge tool intents through the ribbon", async () => {
    const wrapper = mountRibbon("en-US", {
      dataState: {
        activeCell: { row: 2, column: 3 },
        sortEnabled: true,
        filterEnabled: true,
        freezeEnabled: true,
        filter: {
          active: true,
          options: [{ key: { kind: "string", value: "Open" }, label: "Open" }],
          appliedKeys: [{ kind: "string", value: "Open" }],
        },
        freeze: { rows: 0, columns: 0 },
      },
      mergeState: { canMerge: true, canUnmerge: false },
    });

    await wrapper.get('[data-ribbon-action="sort"]').trigger("click");
    await new DOMWrapper(document.body).get('[data-sort-direction="ascending"]').trigger("click");
    expect(wrapper.emitted("sort")).toEqual([["ascending"]]);

    await wrapper.get('[data-ribbon-action="filter"]').trigger("click");
    await new DOMWrapper(document.body).get('[data-filter-action="clear-filter"]').trigger("click");
    expect(wrapper.emitted("clearFilter")).toEqual([[]]);

    await wrapper.get('[data-ribbon-action="filter"]').trigger("click");
    await new DOMWrapper(document.body)
      .get('[data-filter-action="clear-selection"]')
      .trigger("click");
    await new DOMWrapper(document.body).get('[data-filter-action="apply"]').trigger("click");
    expect(wrapper.emitted("applyFilter")).toEqual([[[]]]);

    await wrapper.get('[data-ribbon-action="freeze"]').trigger("click");
    await new DOMWrapper(document.body).get('[data-freeze-action="top-row"]').trigger("click");
    expect(wrapper.emitted("freeze")).toEqual([["top-row"]]);

    await wrapper
      .get('[data-ribbon-action="merge-cells"] [data-ribbon-split-main]')
      .trigger("click");
    expect(wrapper.emitted("merge")).toEqual([["all"]]);

    await wrapper.get('[data-ribbon-action="image"]').trigger("click");
    await new DOMWrapper(document.body).get('[data-image-insert-mode="floating"]').trigger("click");
    expect(wrapper.emitted("insertImage")).toEqual([["floating"]]);
  });

  test("localizes the category, surface, and concrete data tool labels", () => {
    const wrapper = mountRibbon("zh-CN");

    expect(wrapper.get("header").attributes("aria-label")).toBe("工作簿工具");
    expect(wrapper.get('[data-ribbon-category="home"]').text()).toBe("开始");
    expect(wrapper.get('[data-ribbon-category="data"]').text()).toBe("数据");
    expect(wrapper.get(".spreadsheet-ribbon__panel").attributes("aria-labelledby")).toBe(
      wrapper.get('[data-ribbon-category="home"]').attributes("id"),
    );
    expect(wrapper.get('[data-ribbon-action="clear-formatting"]').attributes("aria-label")).toBe(
      "清除格式",
    );
    expect(wrapper.get('[data-ribbon-action="wrap-text"]').attributes("aria-label")).toBe(
      "自动换行",
    );
    expect(wrapper.get('[data-ribbon-action="filter"]').attributes("aria-label")).toBe("筛选");
    expect(wrapper.get('[data-ribbon-action="freeze"]').attributes("aria-label")).toBe("冻结");
    expect(wrapper.get('[data-ribbon-action="sort"]').attributes("aria-label")).toBe("排序");
    expect(
      wrapper
        .get('[data-ribbon-action="merge-cells"] [data-ribbon-split-main]')
        .attributes("aria-label"),
    ).toBe("合并单元格");
    expect(wrapper.get(".font-format-controls__family input").element).toHaveProperty(
      "value",
      "默认字体",
    );
  });

  test("navigates all categories with the keyboard and opens Data from Home", async () => {
    const wrapper = mountRibbon();
    await wrapper.get('[data-ribbon-action="open-data-tools"]').trigger("click");
    expect(wrapper.get('[data-ribbon-category="data"]').attributes("aria-selected")).toBe("true");
    await wrapper.get('[data-ribbon-category="data"]').trigger("keydown", { key: "ArrowRight" });
    expect(wrapper.get('[data-ribbon-category="review"]').attributes("aria-selected")).toBe("true");
    await wrapper.get('[data-ribbon-category="review"]').trigger("keydown", { key: "ArrowRight" });
    expect(wrapper.get('[data-ribbon-category="view"]').attributes("aria-selected")).toBe("true");
    await wrapper.get('[data-ribbon-category="view"]').trigger("keydown", { key: "ArrowRight" });
    expect(wrapper.get('[data-ribbon-category="home"]').attributes("aria-selected")).toBe("true");
    await wrapper.get('[data-ribbon-category="home"]').trigger("keydown", { key: "End" });
    expect(wrapper.get('[data-ribbon-category="view"]').attributes("aria-selected")).toBe("true");
    await wrapper.get('[data-ribbon-category="view"]').trigger("keydown", { key: "ArrowLeft" });
    expect(wrapper.get('[data-ribbon-category="review"]').attributes("aria-selected")).toBe("true");
    await wrapper.get('[data-ribbon-category="review"]').trigger("keydown", { key: "ArrowLeft" });
    expect(wrapper.get('[data-ribbon-category="data"]').attributes("aria-selected")).toBe("true");
    await wrapper.get('[data-ribbon-category="data"]').trigger("keydown", { key: "Home" });
    expect(wrapper.get('[data-ribbon-category="home"]').attributes("aria-selected")).toBe("true");
  });

  test("shows contextual Table tools and restores the previous category on leaving a table", async () => {
    const wrapper = mount(SpreadsheetRibbon, {
      props: { state: createDefaultSelectionCellStyleState(), disabled: false },
      global: { plugins: [createAppI18n("zh-CN")] },
      slots: {
        "table-tools": "<div data-table-panel>表格快捷设置</div>",
        "view-tools": "<div data-view-panel>视图设置</div>",
      },
    });
    expect(wrapper.find('[data-ribbon-category="table"]').exists()).toBe(false);
    await wrapper.setProps({ hasTable: true });
    expect(wrapper.get('[data-ribbon-category="table"]').text()).toBe("表格工具");
    expect(wrapper.get('[data-ribbon-category="home"]').attributes("aria-selected")).toBe("true");
    await wrapper.get('[data-ribbon-category="data"]').trigger("click");
    await wrapper.get('[data-ribbon-category="data"]').trigger("keydown", { key: "ArrowRight" });
    expect(wrapper.get('[data-ribbon-category="review"]').attributes("aria-selected")).toBe("true");
    await wrapper.get('[data-ribbon-category="review"]').trigger("keydown", { key: "ArrowRight" });
    expect(wrapper.get("[data-view-panel]").text()).toBe("视图设置");
    await wrapper.get('[data-ribbon-category="view"]').trigger("keydown", { key: "ArrowRight" });
    expect(wrapper.get("[data-table-panel]").text()).toBe("表格快捷设置");
    expect(wrapper.get('[role="tabpanel"]').attributes("aria-labelledby")).toBe(
      wrapper.get('[data-ribbon-category="table"]').attributes("id"),
    );
    await wrapper.setProps({ hasTable: false });
    expect(wrapper.find('[data-ribbon-category="table"]').exists()).toBe(false);
    expect(wrapper.find("[data-table-panel]").exists()).toBe(false);
    expect(wrapper.get('[data-ribbon-category="view"]').attributes("aria-selected")).toBe("true");
    await wrapper.get('[data-ribbon-category="view"]').trigger("keydown", { key: "ArrowRight" });
    expect(wrapper.get('[data-ribbon-category="home"]').attributes("aria-selected")).toBe("true");
    wrapper.unmount();
  });
});
