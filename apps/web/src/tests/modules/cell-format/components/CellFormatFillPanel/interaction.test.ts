import { mount } from "@vue/test-utils";
import { defineComponent, ref } from "vue";
import { afterEach, describe, expect, test } from "vitest";
import { createDefaultSelectionCellStyleState } from "@idea10/core/style-state";
import type { CellFillGradient, CellStylePatch } from "@idea10/core/style";
import CellFormatFillPanel from "../../../../../modules/cell-format/components/CellFormatFillPanel.vue";
import CellFormatFillEffectsDialog from "../../../../../modules/cell-format/components/CellFormatFillEffectsDialog.vue";
import CellFormatPatternControl from "../../../../../modules/cell-format/components/CellFormatPatternControl.vue";
import ColorPalette from "../../../../../shared/color/ColorPalette.vue";
import { createAppI18n } from "../../../../../shared/i18n";

const wrappers: Array<{ unmount(): void }> = [];
afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()));
function mountPanel(state = createDefaultSelectionCellStyleState()) {
  const Harness = defineComponent({
    components: { CellFormatFillPanel },
    setup() {
      const patch = ref<CellStylePatch>({});
      return { state, patch };
    },
    template: `<CellFormatFillPanel :state="state" :patch="patch" :sample-value="null" @update:patch="patch = { ...patch, ...$event }" />`,
  });
  const wrapper = mount(Harness, { global: { plugins: [createAppI18n("en-US")] } });
  wrappers.push(wrapper);
  const panel = wrapper.getComponent(CellFormatFillPanel);
  return { wrapper, panel, patch: () => panel.props("patch") };
}
const gradient: CellFillGradient = {
  type: "linear",
  angle: 90,
  stops: [
    { position: 0, color: "#ffffff" },
    { position: 1, color: "#4472c4" },
  ],
};

describe("CellFormatFillPanel", () => {
  test("changes background without losing the selected pattern", async () => {
    const state = createDefaultSelectionCellStyleState();
    state.fillColor.value = "#ffffff";
    state.fillPattern.value = "darkGrid";
    state.fillPatternColor.value = "#ff0000";
    const { wrapper, panel, patch } = mountPanel(state);
    expect(panel.getComponent(CellFormatPatternControl).props("modelValue")).toBe("darkGrid");
    expect(panel.get("[data-cell-format-no-fill]").attributes("aria-pressed")).toBe("false");
    panel.getComponent(ColorPalette).vm.$emit("select", "#4472c4");
    await wrapper.vm.$nextTick();
    expect(patch()).toEqual({ fillColor: "#4472c4", fillGradient: null });
    expect(panel.getComponent(CellFormatPatternControl).props("modelValue")).toBe("darkGrid");
    const preview = panel.get<HTMLElement>("[data-cell-format-fill-preview]").element;
    expect(preview.style.backgroundColor).toBe("#4472c4");
    expect(preview.style.backgroundImage).toContain("data:image/svg+xml");
    panel.getComponent(CellFormatPatternControl).vm.$emit("select", "none");
    await wrapper.vm.$nextTick();
    expect(patch()).toMatchObject({ fillPattern: null, fillPatternColor: null });
    expect(preview.style.backgroundImage).toBe("");
    expect(preview.style.backgroundColor).toBe("#4472c4");
  });

  test("switches a gradient to a pattern with a separate foreground color", async () => {
    const state = createDefaultSelectionCellStyleState();
    state.fillGradient.value = gradient;
    const { wrapper, panel, patch } = mountPanel(state);
    panel.getComponent(CellFormatPatternControl).vm.$emit("select", "lightUp");
    await wrapper.vm.$nextTick();
    expect(patch()).toEqual({
      fillPattern: "lightUp",
      fillPatternColor: "#000000",
      fillGradient: null,
    });
    expect(
      panel.get("[data-cell-format-pattern-color] button").attributes("disabled"),
    ).toBeUndefined();
    expect(
      panel.get<HTMLElement>("[data-cell-format-fill-preview]").element.style.backgroundImage,
    ).toContain("data:image/svg+xml");
  });

  test("clears every fill property and disables pattern color when no pattern is selected", async () => {
    const state = createDefaultSelectionCellStyleState();
    state.fillGradient.value = gradient;
    const { panel, patch } = mountPanel(state);
    await panel.get("[data-cell-format-no-fill]").trigger("click");
    expect(patch()).toEqual({
      fillColor: null,
      fillPattern: null,
      fillPatternColor: null,
      fillGradient: null,
    });
    expect(panel.get("[data-cell-format-no-fill]").attributes("aria-pressed")).toBe("true");
    expect(
      panel.get("[data-cell-format-pattern-color] button").attributes("disabled"),
    ).toBeDefined();
    expect(
      panel.get<HTMLElement>("[data-cell-format-fill-preview]").element.style.backgroundImage,
    ).toBe("");
  });

  test("keeps mixed settings untouched until a fill edit is made", async () => {
    const state = createDefaultSelectionCellStyleState();
    state.fillColor.mixed = true;
    state.fillPattern.mixed = true;
    const { panel, patch } = mountPanel(state);
    expect(patch()).toEqual({});
    expect(panel.getComponent(CellFormatPatternControl).props("modelValue")).toBeUndefined();
    expect(panel.get("[data-cell-format-fill-preview]").attributes("aria-label")).toBe("Mixed");
    await panel.get("[data-cell-format-no-fill]").trigger("click");
    expect(panel.get("[data-cell-format-fill-preview]").attributes("aria-label")).toBe("Preview");
  });

  test("cancels gradient changes locally and applies confirmed gradients as a single fill draft", async () => {
    const { wrapper, panel, patch } = mountPanel();
    await panel.get("[data-cell-format-fill-effects]").trigger("click");
    panel.getComponent(CellFormatFillEffectsDialog).vm.$emit("cancel");
    await wrapper.vm.$nextTick();
    expect(patch()).toEqual({});
    await panel.get("[data-cell-format-fill-effects]").trigger("click");
    panel.getComponent(CellFormatFillEffectsDialog).vm.$emit("confirm", gradient);
    await wrapper.vm.$nextTick();
    expect(patch()).toEqual({
      fillColor: null,
      fillPattern: null,
      fillPatternColor: null,
      fillGradient: gradient,
    });
    expect(panel.findComponent(CellFormatFillEffectsDialog).exists()).toBe(false);
    expect(
      panel.get<HTMLElement>("[data-cell-format-fill-preview]").element.style.backgroundImage,
    ).toContain("linear-gradient");
  });
});
