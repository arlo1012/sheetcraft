import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { isVNode, type VNode } from "vue";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { SheetChart } from "@sheetcraft/core/sheet-charts";
import ChartQuickLayoutGallery from "../../../modules/charts/components/ChartQuickLayoutGallery.vue";
import ChartDataTableControls from "../../../modules/charts/components/ChartDataTableControls.vue";
import type { ChartQuickLayoutId } from "../../../modules/charts/chart-quick-layout";
import { createAppI18n } from "../../../shared/i18n";
import MenuRadioItem from "../../../shared/menu/MenuRadioItem.vue";

const mounted: VueWrapper[] = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
function chart(overrides: Partial<SheetChart> = {}): SheetChart {
  return {
    type: "column",
    range: { start: { row: 0, column: 0 }, end: { row: 3, column: 2 } },
    title: "Sales",
    headerRow: true,
    headerColumn: true,
    seriesBy: "columns",
    legend: true,
    labels: false,
    stacked: false,
    showHidden: false,
    ...overrides,
  };
}
function gallery(
  options: {
    chart?: SheetChart;
    selected?: ChartQuickLayoutId;
    disabled?: boolean;
    apply?: (id: ChartQuickLayoutId) => boolean;
    preview?: (id?: ChartQuickLayoutId) => boolean;
  } = {},
  locale: "en-US" | "zh-CN" = "en-US",
) {
  const apply = options.apply ?? vi.fn((_id: ChartQuickLayoutId) => true),
    preview = options.preview ?? vi.fn((_id?: ChartQuickLayoutId) => true);
  const wrapper = mount(ChartQuickLayoutGallery, {
    attachTo: document.body,
    props: { chart: chart(), disabled: false, ...options, apply, preview },
    global: { plugins: [createAppI18n(locale)] },
  });
  mounted.push(wrapper);
  return { wrapper, apply, preview };
}
function choice(wrapper: VueWrapper, id: ChartQuickLayoutId) {
  return wrapper.get(`[data-chart-quick-layout="${id}"]`);
}
function choiceVNode(wrapper: VueWrapper, id: ChartQuickLayoutId): VNode {
  function find(node: VNode): VNode | undefined {
    if (node.props?.["data-chart-quick-layout"] === String(id)) return node;
    if (!Array.isArray(node.children)) return undefined;
    for (const child of node.children) {
      if (!isVNode(child)) continue;
      const result = find(child);
      if (result) return result;
    }
    return undefined;
  }
  return find(wrapper.vm.$.subTree)!;
}

describe("eleven concrete Quick Layout choices", () => {
  test("Chinese captions stay single-line and every owned thumbnail has a distinct hierarchy", () => {
    const { wrapper } = gallery({}, "zh-CN");
    expect(wrapper.findAll("button").map((button) => button.text())).toEqual([
      "布局1",
      "布局2",
      "布局3",
      "布局4",
      "布局5",
      "布局6",
      "布局7",
      "布局8",
      "布局9",
      "布局10",
      "布局11",
    ]);
    expect(wrapper.findAll("svg")).toHaveLength(11);
    expect(new Set(wrapper.findAll("svg").map((svg) => svg.html())).size).toBe(11);
    expect(wrapper.find("img, image, use").exists()).toBe(false);
    expect(wrapper.text()).not.toContain("WPS");
    expect(
      choice(wrapper, 5).find('[data-thumbnail-element="data-table-with-keys"]').exists(),
    ).toBe(true);
    expect(wrapper.findAll('[data-thumbnail-element="data-table-with-keys"]')).toHaveLength(1);
    expect(
      choice(wrapper, 6)
        .find('[data-thumbnail-element="labels-last-category-series-value"]')
        .exists(),
    ).toBe(true);
    expect(choice(wrapper, 7).find('[data-thumbnail-element="gridlines-minor"]').exists()).toBe(
      true,
    );
    expect(choice(wrapper, 8).find('[data-thumbnail-element="gapless-series"]').exists()).toBe(
      true,
    );
    expect(choice(wrapper, 8).find('[data-thumbnail-element="gridlines"]').exists()).toBe(false);
    expect(choice(wrapper, 10).find('[data-thumbnail-element="overlapping-series"]').exists()).toBe(
      true,
    );
    expect(
      choice(wrapper, 10).find('[data-thumbnail-element="labels-front-series-inside"]').exists(),
    ).toBe(true);
    for (const id of [4, 7, 11] as const)
      expect(choice(wrapper, id).find('[data-thumbnail-element="title"]').exists()).toBe(false);
  });

  test("selection follows only the owner's effective match and never changes the document", async () => {
    const source = chart(),
      before = JSON.stringify(source),
      f = gallery({ chart: source, selected: 5 });
    expect(choice(f.wrapper, 5).attributes("aria-checked")).toBe("true");
    expect(f.wrapper.findAll('[aria-checked="true"]')).toHaveLength(1);
    await f.wrapper.setProps({ selected: undefined });
    expect(f.wrapper.findAll('[aria-checked="true"]')).toHaveLength(0);
    expect(f.wrapper.text()).toContain("does not match a preset");
    expect(JSON.stringify(source)).toBe(before);
    expect(f.apply).not.toHaveBeenCalled();
    expect(f.preview).not.toHaveBeenCalled();
  });

  test("hover and focus preview only; leaving, blur and unmount clear the captured preview", async () => {
    const f = gallery(),
      before = JSON.stringify(f.wrapper.props("chart"));
    await choice(f.wrapper, 5).trigger("pointerenter");
    await choice(f.wrapper, 5).trigger("focus");
    expect(f.preview).toHaveBeenCalledExactlyOnceWith(5);
    expect(f.apply).not.toHaveBeenCalled();
    expect(JSON.stringify(f.wrapper.props("chart"))).toBe(before);
    await choice(f.wrapper, 5).trigger("pointerleave");
    expect(f.preview).toHaveBeenLastCalledWith(undefined);
    await choice(f.wrapper, 6).trigger("focus");
    await f.wrapper.trigger("focusout", { relatedTarget: choice(f.wrapper, 7).element });
    expect(f.preview).toHaveBeenLastCalledWith(6);
    await f.wrapper.trigger("focusout", { relatedTarget: null });
    expect(f.preview).toHaveBeenLastCalledWith(undefined);
    await choice(f.wrapper, 8).trigger("pointerenter");
    await f.wrapper.trigger("pointerleave");
    expect(f.preview).toHaveBeenLastCalledWith(undefined);
    await choice(f.wrapper, 9).trigger("focus");
    f.wrapper.unmount();
    expect(f.preview).toHaveBeenLastCalledWith(undefined);
    expect(f.apply).not.toHaveBeenCalled();
  });

  test.each(["false", "throw"] as const)(
    "a %s preview reports failure without applying",
    async (mode) => {
      const preview = vi.fn((_id?: ChartQuickLayoutId) => {
        if (mode === "throw") throw new Error("Preview owner unavailable");
        return false;
      });
      const f = gallery({ preview });
      await choice(f.wrapper, 5).trigger("pointerenter");
      expect(preview).toHaveBeenCalledWith(5);
      expect(preview).toHaveBeenLastCalledWith(undefined);
      expect(f.wrapper.get('[role="alert"]').text()).toContain("preview is unavailable");
      expect(f.apply).not.toHaveBeenCalled();
    },
  );

  test.each(["false", "throw"] as const)(
    "a %s apply keeps the choices and retries once",
    async (mode) => {
      const apply = vi.fn((_id: ChartQuickLayoutId) => {
        if (mode === "throw") throw new Error("Apply owner unavailable");
        return false;
      });
      const f = gallery({ apply, selected: 5 });
      await choice(f.wrapper, 5).trigger("focus");
      await choice(f.wrapper, 5).trigger("click");
      expect(apply).toHaveBeenCalledExactlyOnceWith(5);
      expect(f.preview).toHaveBeenLastCalledWith(undefined);
      expect(f.wrapper.findAll("button")).toHaveLength(11);
      expect(f.wrapper.get('[role="alert"]').text()).toContain("layout was not applied");
      apply.mockReturnValue(true);
      await choice(f.wrapper, 5).trigger("click");
      expect(apply).toHaveBeenCalledTimes(2);
      expect(f.wrapper.find('[role="alert"]').exists()).toBe(false);
    },
  );

  test.each(["Enter", " "])(
    "%s selects once and suppresses the native click and repeat",
    async (key) => {
      const f = gallery({ selected: 3 }),
        event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
      choice(f.wrapper, 3).element.dispatchEvent(event);
      await flushPromises();
      expect(event.defaultPrevented).toBe(true);
      expect(f.apply).toHaveBeenCalledExactlyOnceWith(3);
      await choice(f.wrapper, 3).trigger("keydown", { key, repeat: true });
      await choice(f.wrapper, 3).trigger("keydown", { key, isComposing: true });
      expect(f.apply).toHaveBeenCalledTimes(1);
      await choice(f.wrapper, 3).trigger("click");
      expect(f.apply).toHaveBeenCalledTimes(2);
    },
  );

  test.each(["chart", "callbacks"] as const)(
    "retained events cannot retarget after changing %s",
    async (owner) => {
      const f = gallery(),
        oldClick = choiceVNode(f.wrapper, 5).props!.onClick as () => void,
        oldPreview = choiceVNode(f.wrapper, 5).props!.onPointerenter as () => void,
        nextApply = vi.fn((_id: ChartQuickLayoutId) => true),
        nextPreview = vi.fn((_id?: ChartQuickLayoutId) => true);
      await choice(f.wrapper, 5).trigger("pointerenter");
      await f.wrapper.setProps(
        owner === "chart" ? { chart: chart() } : { apply: nextApply, preview: nextPreview },
      );
      expect(f.preview).toHaveBeenLastCalledWith(undefined);
      const previousPreviewCalls = vi.mocked(f.preview).mock.calls.length;
      oldClick();
      oldPreview();
      expect(f.apply).not.toHaveBeenCalled();
      expect(f.preview).toHaveBeenCalledTimes(previousPreviewCalls);
      expect(nextApply).not.toHaveBeenCalled();
      expect(nextPreview).not.toHaveBeenCalled();
      expect(f.wrapper.find('[role="alert"]').exists()).toBe(false);
    },
  );

  test("disabled and dismissed galleries reject retained click, key and preview handlers", async () => {
    const f = gallery(),
      vnode = choiceVNode(f.wrapper, 5),
      click = vnode.props!.onClick as () => void,
      focus = vnode.props!.onFocus as () => void,
      keydown = vnode.props!.onKeydown as (event: KeyboardEvent) => void;
    await choice(f.wrapper, 5).trigger("focus");
    await f.wrapper.setProps({ disabled: true });
    expect(f.wrapper.findAll('button[disabled][aria-disabled="true"]')).toHaveLength(11);
    expect(f.preview).toHaveBeenLastCalledWith(undefined);
    const previousPreviewCalls = vi.mocked(f.preview).mock.calls.length;
    click();
    focus();
    keydown(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(f.apply).not.toHaveBeenCalled();
    expect(f.preview).toHaveBeenCalledTimes(previousPreviewCalls);
    await f.wrapper.setProps({ disabled: false });
    f.wrapper.unmount();
    click();
    focus();
    expect(f.apply).not.toHaveBeenCalled();
    expect(f.preview).toHaveBeenCalledTimes(previousPreviewCalls);
  });
});

function tables(
  source = chart(),
  apply = vi.fn((_choice: "none" | "withLegendKeys" | "withoutLegendKeys") => true),
  locale: "en-US" | "zh-CN" = "en-US",
) {
  const wrapper = mount(ChartDataTableControls, {
    attachTo: document.body,
    props: { chart: source, disabled: false, apply },
    global: { plugins: [createAppI18n(locale)] },
  });
  mounted.push(wrapper);
  return { wrapper, apply };
}
function tableChoice(wrapper: VueWrapper, value: "none" | "withLegendKeys" | "withoutLegendKeys") {
  return wrapper.get(`[data-chart-data-table="${value}"]`);
}

describe("chart data table choices", () => {
  test("three concrete Chinese choices reflect the actual table field", async () => {
    const source = chart({ elements: { dataTable: "withLegendKeys" } }),
      before = JSON.stringify(source),
      f = tables(source, undefined, "zh-CN");
    expect(f.wrapper.findAll('[role="menuitemradio"]').map((item) => item.text())).toEqual([
      "无",
      "带图例标示",
      "无图例标示",
    ]);
    expect(tableChoice(f.wrapper, "withLegendKeys").attributes("aria-checked")).toBe("true");
    await f.wrapper.setProps({ chart: chart({ elements: { dataTable: "withoutLegendKeys" } }) });
    expect(tableChoice(f.wrapper, "withoutLegendKeys").attributes("aria-checked")).toBe("true");
    expect(f.apply).not.toHaveBeenCalled();
    expect(JSON.stringify(source)).toBe(before);
  });

  test.each(["column", "line", "area"] as const)(
    "%s exposes all three working choices",
    async (type) => {
      const f = tables(chart({ type }));
      expect(f.wrapper.findAll('[aria-disabled="false"]')).toHaveLength(3);
      await tableChoice(f.wrapper, "withLegendKeys").trigger("click");
      expect(f.apply).toHaveBeenCalledExactlyOnceWith("withLegendKeys");
      expect(f.wrapper.text()).toContain("current series and categories");
    },
  );

  test.each(["bar", "pie", "scatter"] as const)(
    "%s is gated with a capability hint",
    async (type) => {
      const f = tables(chart({ type }));
      expect(f.wrapper.findAll('[role="menuitemradio"][aria-disabled="true"]')).toHaveLength(3);
      await tableChoice(f.wrapper, "withLegendKeys").trigger("click");
      await tableChoice(f.wrapper, "none").trigger("keydown", { key: "Enter" });
      expect(f.apply).not.toHaveBeenCalled();
      expect(f.wrapper.text()).toContain(
        type === "bar" ? "vertical category axis" : "support column, line and area",
      );
    },
  );

  test("click and Enter each apply once; repeated or composing keys do not apply", async () => {
    const f = tables();
    await tableChoice(f.wrapper, "withLegendKeys").trigger("click");
    expect(f.apply).toHaveBeenCalledExactlyOnceWith("withLegendKeys");
    await tableChoice(f.wrapper, "withoutLegendKeys").trigger("keydown", { key: "Enter" });
    expect(f.apply).toHaveBeenCalledTimes(2);
    expect(f.apply).toHaveBeenLastCalledWith("withoutLegendKeys");
    await tableChoice(f.wrapper, "none").trigger("keydown", { key: "Enter", repeat: true });
    await tableChoice(f.wrapper, "none").trigger("keydown", { key: "Enter", isComposing: true });
    expect(f.apply).toHaveBeenCalledTimes(2);
  });

  test.each(["false", "throw"] as const)(
    "%s table apply remains visible and retryable",
    async (mode) => {
      const apply = vi.fn((_value: "none" | "withLegendKeys" | "withoutLegendKeys") => {
        if (mode === "throw") throw new Error("Table owner unavailable");
        return false;
      });
      const f = tables(chart(), apply);
      await tableChoice(f.wrapper, "withLegendKeys").trigger("click");
      expect(apply).toHaveBeenCalledExactlyOnceWith("withLegendKeys");
      expect(f.wrapper.get('[role="alert"]').text()).toContain("data table was not changed");
      apply.mockReturnValue(true);
      await tableChoice(f.wrapper, "withLegendKeys").trigger("click");
      expect(apply).toHaveBeenCalledTimes(2);
      expect(f.wrapper.find('[role="alert"]').exists()).toBe(false);
    },
  );

  test.each(["chart", "callback", "disabled", "unmount"] as const)(
    "retained table selections reject a %s owner change",
    async (change) => {
      const f = tables(),
        oldSelect = f.wrapper.findAllComponents(MenuRadioItem)[1]!.vm.$.vnode.props!.onSelect as (
          event: MouseEvent,
        ) => void,
        replacement = vi.fn((_value: "none" | "withLegendKeys" | "withoutLegendKeys") => true);
      if (change === "chart") await f.wrapper.setProps({ chart: chart() });
      if (change === "callback") await f.wrapper.setProps({ apply: replacement });
      if (change === "disabled") await f.wrapper.setProps({ disabled: true });
      if (change === "unmount") f.wrapper.unmount();
      oldSelect(new MouseEvent("click"));
      expect(f.apply).not.toHaveBeenCalled();
      expect(replacement).not.toHaveBeenCalled();
    },
  );
});
