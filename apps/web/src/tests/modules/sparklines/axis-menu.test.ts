// 未执行：按用户要求仅编写测试，不运行检查。
import { DOMWrapper, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { CellSparkline } from "@sheetcraft/core/sparklines";
import SparklineAxisMenu from "../../../modules/sparklines/components/SparklineAxisMenu.vue";
import type {
  SparklineStylePatch,
  SparklineToolContext,
} from "../../../modules/sparklines/useSparklineTools";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";
import { createAppI18n } from "../../../shared/i18n";

const mounted: Array<{ unmount(): void }> = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
});

function createContext(patch: Partial<SparklineToolContext> = {}) {
  const value: CellSparkline = {
    type: "line",
    source: null,
    color: "#123456",
    negativeColor: "#654321",
    markers: false,
    axis: false,
    rightToLeft: false,
    showHidden: false,
    empty: "gap",
  };
  return {
    key: "sheet-selection",
    value,
    mixed: [],
    mixedPointVisibility: [],
    mixedAxisModes: [],
    disabled: false,
    apply: vi.fn((_patch: SparklineStylePatch) => true),
    edit: vi.fn(),
    clear: vi.fn(() => true),
    clearGroup: vi.fn(() => true),
    canGroup: false,
    canUngroup: false,
    group: vi.fn(() => false),
    ungroup: vi.fn(() => false),
    ...patch,
  } satisfies SparklineToolContext;
}

function fixture(patch: Partial<SparklineToolContext> = {}) {
  const context = createContext(patch);
  const wrapper = mount(SparklineAxisMenu, {
    attachTo: document.body,
    props: { context },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  return { context, wrapper };
}

function menu() {
  return new DOMWrapper(document.body).get('[role="menu"]');
}

function axisMode(end: "minAxis" | "maxAxis", mode: "individual" | "group" | "custom") {
  return menu().get(`[data-sparkline-axis-end="${end}"][data-sparkline-axis-mode="${mode}"]`);
}

describe("sparkline axis menu", () => {
  test("opens the axis disclosure without immediately toggling the horizontal axis", async () => {
    const f = fixture();
    const trigger = f.wrapper.getComponent(RibbonMenuButton);
    expect(trigger.attributes("aria-expanded")).toBe("false");
    await trigger.trigger("click");

    expect(trigger.attributes("aria-expanded")).toBe("true");
    expect(menu().attributes("role")).toBe("menu");
    expect(f.context.apply).not.toHaveBeenCalled();
  });

  test.each([
    { end: "minAxis" as const, mode: "individual" as const },
    { end: "minAxis" as const, mode: "group" as const },
    { end: "maxAxis" as const, mode: "individual" as const },
    { end: "maxAxis" as const, mode: "group" as const },
  ])("sets only the $end $mode mode and dismisses the menu", async ({ end, mode }) => {
    const initial = createContext();
    const f = fixture({
      value: {
        ...initial.value,
        [end]: { type: mode === "individual" ? "group" : "individual" },
      },
    });
    await f.wrapper.getComponent(RibbonMenuButton).trigger("click");
    await axisMode(end, mode).trigger("click");

    expect(f.context.apply).toHaveBeenCalledTimes(1);
    expect(f.context.apply).toHaveBeenCalledWith({ [end]: { type: mode } });
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
    expect(f.wrapper.emitted("failed")).toBeUndefined();
  });

  test("closes without applying when the selected axis mode is already active", async () => {
    const f = fixture();
    await f.wrapper.getComponent(RibbonMenuButton).trigger("click");
    await axisMode("minAxis", "individual").trigger("click");

    expect(f.context.apply).not.toHaveBeenCalled();
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
    expect(f.wrapper.emitted("failed")).toBeUndefined();
  });

  test.each(["minAxis", "maxAxis"] as const)(
    "requests the custom %s dialog without applying a guessed limit",
    async (end) => {
      const f = fixture();
      await f.wrapper.getComponent(RibbonMenuButton).trigger("click");
      await axisMode(end, "custom").trigger("click");

      expect(f.wrapper.emitted("custom")).toEqual([[end]]);
      expect(f.context.apply).not.toHaveBeenCalled();
      expect(document.body.querySelector('[role="menu"]')).toBeNull();
    },
  );

  test("keeps custom mode selected when only its values are mixed", async () => {
    const initial = createContext();
    const f = fixture({
      value: { ...initial.value, minAxis: { type: "custom", value: -10 } },
      mixed: ["minAxis"],
      mixedAxisModes: [],
    });
    await f.wrapper.getComponent(RibbonMenuButton).trigger("click");

    expect(axisMode("minAxis", "custom").attributes("aria-checked")).toBe("true");
    expect(axisMode("minAxis", "individual").attributes("aria-checked")).toBe("false");
    expect(axisMode("minAxis", "group").attributes("aria-checked")).toBe("false");
    expect(axisMode("maxAxis", "individual").attributes("aria-checked")).toBe("true");
  });

  test("leaves every mode unchecked only for the endpoint with mixed modes", async () => {
    const f = fixture({ mixed: ["maxAxis"], mixedAxisModes: ["maxAxis"] });
    await f.wrapper.getComponent(RibbonMenuButton).trigger("click");

    for (const mode of ["individual", "group", "custom"] as const)
      expect(axisMode("maxAxis", mode).attributes("aria-checked")).toBe("false");
    expect(axisMode("minAxis", "individual").attributes("aria-checked")).toBe("true");
  });

  test.each([
    { field: "axis" as const, current: false, mixed: false, next: true },
    { field: "axis" as const, current: true, mixed: false, next: false },
    { field: "axis" as const, current: true, mixed: true, next: true },
    { field: "rightToLeft" as const, current: false, mixed: false, next: true },
    { field: "rightToLeft" as const, current: true, mixed: false, next: false },
    { field: "rightToLeft" as const, current: true, mixed: true, next: true },
  ])(
    "changes $field from $current with mixed=$mixed to $next",
    async ({ field, current, mixed, next }) => {
      const initial = createContext();
      const f = fixture({
        value: { ...initial.value, [field]: current },
        mixed: mixed ? [field] : [],
      });
      await f.wrapper.getComponent(RibbonMenuButton).trigger("click");
      await menu().get(`[data-sparkline-axis-action="${field}"]`).trigger("click");

      expect(f.context.apply).toHaveBeenCalledTimes(1);
      expect(f.context.apply).toHaveBeenCalledWith({ [field]: next });
      expect(document.body.querySelector('[role="menu"]')).toBeNull();
    },
  );

  test("reports a refused mode change to the owner", async () => {
    const apply = vi.fn((_patch: SparklineStylePatch) => false);
    const f = fixture({ apply });
    await f.wrapper.getComponent(RibbonMenuButton).trigger("click");
    await axisMode("maxAxis", "group").trigger("click");

    expect(apply).toHaveBeenCalledWith({ maxAxis: { type: "group" } });
    expect(f.wrapper.emitted("failed")).toEqual([[]]);
  });

  test("does not open the menu for a disabled context", async () => {
    const f = fixture({ disabled: true });
    await f.wrapper.getComponent(RibbonMenuButton).trigger("click");

    expect(document.body.querySelector('[role="menu"]')).toBeNull();
    expect(f.context.apply).not.toHaveBeenCalled();
    expect(f.wrapper.emitted("custom")).toBeUndefined();
  });

  test.each(["group", "custom"] as const)(
    "rejects the retained %s menu callback after replacing its owner with the same key",
    async (mode) => {
      const f = fixture();
      await f.wrapper.getComponent(RibbonMenuButton).trigger("click");
      const item = f.wrapper
        .findAllComponents(MenuItem)
        .find(
          (candidate) =>
            candidate.attributes("data-sparkline-axis-end") === "minAxis" &&
            candidate.attributes("data-sparkline-axis-mode") === mode,
        )!;
      const oldSelect = item.vm.$.vnode.props!.onSelect as (event: MouseEvent) => void;
      const replacement = createContext({ key: f.context.key });
      await f.wrapper.setProps({ context: replacement });
      oldSelect(new MouseEvent("click"));

      expect(document.body.querySelector('[role="menu"]')).toBeNull();
      expect(f.context.apply).not.toHaveBeenCalled();
      expect(replacement.apply).not.toHaveBeenCalled();
      expect(f.wrapper.emitted("custom")).toBeUndefined();
      expect(f.wrapper.emitted("failed")).toBeUndefined();
    },
  );
});
