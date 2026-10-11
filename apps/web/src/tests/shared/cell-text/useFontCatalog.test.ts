import { mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { defineComponent, nextTick, type ShallowRef } from "vue";
import type {
  LocalSymbolFont,
  SystemSymbolFontChoice,
} from "../../../shared/cell-text/local-font-source";
import { useFontCatalog } from "../../../shared/cell-text/useFontCatalog";
import { filterFontFamilyOption } from "../../../shared/cell-text/font-catalog";
import { createAppI18n } from "../../../shared/i18n";
import { createDefaultSelectionCellStyleState } from "@sheetcraft/core/style-state";
import { Input as TInput } from "tdesign-vue-next/es/input";
import FontFormatPanel from "../../../shared/font-format/FontFormatPanel.vue";
import FontFormatControls from "../../../modules/home-tools/components/FontFormatControls.vue";

const state = vi.hoisted(() => ({
  fonts: undefined as ShallowRef<readonly LocalSymbolFont[]> | undefined,
  choices: undefined as ShallowRef<readonly SystemSymbolFontChoice[]> | undefined,
  query: vi.fn(),
  ensure: vi.fn(async () => undefined),
}));
vi.mock("../../../shared/cell-text/local-font-source", async () => {
  const { shallowRef } = await import("vue");
  state.fonts = shallowRef<readonly LocalSymbolFont[]>([]);
  state.choices = shallowRef<readonly SystemSymbolFontChoice[]>([]);
  const queryStatus = shallowRef({ state: "idle" });
  return {
    useLocalSymbolFonts: () => ({ fonts: state.fonts, choices: state.choices, queryStatus }),
    requestSystemFontChoices: state.query,
    ensureLocalSymbolFont: vi.fn(async () => undefined),
  };
});
vi.mock("../../../shared/cell-text/font-resources", async (original) => ({
  ...(await original<typeof import("../../../shared/cell-text/font-resources")>()),
  ensureCellFontResource: state.ensure,
}));

const wrappers: VueWrapper[] = [];
function mountCatalog(current: readonly string[] = []) {
  const Harness = defineComponent({
    props: { current: { type: Array<string>, required: true } },
    setup(props) {
      return { options: useFontCatalog(() => props.current).fontOptions };
    },
    template: `<div><span v-for="item in options" :key="item.value" :data-font="item.value">{{item.label}}</span></div>`,
  });
  const wrapper = mount(Harness, {
    props: { current: [...current] },
    global: { plugins: [createAppI18n("zh-CN")] },
  });
  wrappers.push(wrapper);
  return wrapper;
}
function loadedFont(id: string, displayFamily = "微软雅黑"): LocalSymbolFont {
  return {
    id,
    family: `SheetcraftLocal_${id}`,
    displayFamily,
    ranges: [[65, 90]],
    count: 26,
    source: "file",
    persisted: false,
  };
}
beforeEach(() => {
  state.fonts!.value = [];
  state.choices!.value = [];
  state.query.mockReset();
  state.ensure.mockClear();
});
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
});

describe("shared font catalog sources", () => {
  test("listing presets and opening ordinary editors never scans or loads all managed faces", () => {
    const wrapper = mountCatalog(["Inter"]);
    for (const family of [
      "Noto Sans",
      "Noto Sans Math",
      "Noto Sans Symbols",
      "Noto Sans Symbols 2",
    ])
      expect(wrapper.find(`[data-font="${family}"]`).exists()).toBe(true);
    expect(state.query).not.toHaveBeenCalled();
    expect(state.ensure).not.toHaveBeenCalled();
  });

  test("new verified aliases reach all catalogs with readable names and exact resource identity", async () => {
    const first = mountCatalog();
    const second = mountCatalog();
    const one = loadedFont("a".repeat(64));
    const two = loadedFont("b".repeat(64));
    state.fonts!.value = [one, two];
    await nextTick();
    for (const wrapper of [first, second]) {
      expect(wrapper.get(`[data-font="${one.family}"]`).text()).toBe("微软雅黑 · aaaaaa");
      expect(wrapper.get(`[data-font="${two.family}"]`).text()).toBe("微软雅黑 · bbbbbb");
      const option = wrapper.vm.options.find((item) => item.value === one.family)!;
      expect(filterFontFamilyOption("Microsoft YaHei", option)).toBe(true);
      expect(option.value).toBe(one.family);
    }
    expect(state.query).not.toHaveBeenCalled();
    expect(state.ensure).not.toHaveBeenCalled();
  });

  test("scanned metadata adds ordinary names without inventing a loaded hash alias", async () => {
    const wrapper = mountCatalog();
    state.choices!.value = [
      {
        id: "system:Example",
        postscriptName: "Example",
        family: "Example Font",
        fullName: "Example Font Regular",
        style: "Regular",
      },
    ];
    await nextTick();
    expect(wrapper.get('[data-font="Example Font"]').text()).toBe("Example Font");
    expect(wrapper.find('[data-font^="SheetcraftLocal_"]').exists()).toBe(false);
    expect(state.ensure).not.toHaveBeenCalled();
  });

  test("keeps a saved Chinese spelling and gives it both Chinese and English search aliases", () => {
    const wrapper = mountCatalog(["微软雅黑"]);
    const option = wrapper.vm.options.find((item) => item.value === "微软雅黑")!;
    expect(option.label).toBe("微软雅黑");
    expect(filterFontFamilyOption("Microsoft YaHei", option)).toBe(true);
    expect(filterFontFamilyOption("微软雅黑", option)).toBe(true);
    expect(option.value).toBe("微软雅黑");
    expect(state.ensure).not.toHaveBeenCalled();
  });

  test("prepares only an actually selected managed family through the existing resource service", async () => {
    const wrapper = mountCatalog(["Inter"]);
    await wrapper.setProps({ current: ["Noto Sans Math"] });
    expect(state.ensure).toHaveBeenCalledOnce();
    expect(state.ensure).toHaveBeenCalledWith("Noto Sans Math");
    expect(state.query).not.toHaveBeenCalled();
  });

  test("loaded alias labels reach the font panel without replacing its pending typed draft", async () => {
    const face = loadedFont("a".repeat(64));
    const selected = createDefaultSelectionCellStyleState();
    selected.fontFamily = { value: face.family, mixed: false };
    const wrapper = mount(FontFormatPanel, {
      props: { state: selected, patch: {}, sampleValue: "A" },
      global: { plugins: [createAppI18n("zh-CN")] },
    });
    wrappers.push(wrapper);
    const input = wrapper.get("[data-cell-format-font-family]").getComponent(TInput);
    input.vm.$emit("change", "My Typed Font");
    state.fonts!.value = [face];
    await nextTick();
    expect(input.props("modelValue")).toBe("My Typed Font");
    expect(wrapper.text()).toContain("微软雅黑 · aaaaaa");
    expect(wrapper.emitted("update:patch")).toBeUndefined();
  });

  test("loaded alias labels update an unchanged panel and ribbon input but never erase typed ribbon input", async () => {
    const face = loadedFont("a".repeat(64));
    const selected = createDefaultSelectionCellStyleState();
    selected.fontFamily = { value: face.family, mixed: false };
    const panel = mount(FontFormatPanel, {
      props: { state: selected, patch: {}, sampleValue: "A" },
      global: { plugins: [createAppI18n("zh-CN")] },
    });
    const ribbon = mount(FontFormatControls, {
      props: { state: selected, disabled: false },
      global: { plugins: [createAppI18n("zh-CN")] },
    });
    wrappers.push(panel, ribbon);
    const ribbonInput = ribbon.get<HTMLInputElement>(".font-format-controls__family input");
    await ribbonInput.setValue("My Typed Font");
    state.fonts!.value = [face];
    await nextTick();
    expect(
      panel.get("[data-cell-format-font-family]").getComponent(TInput).props("modelValue"),
    ).toBe("微软雅黑 · aaaaaa");
    expect(ribbonInput.element.value).toBe("My Typed Font");
    expect(ribbon.emitted("applyStyle")).toBeUndefined();
  });
});
