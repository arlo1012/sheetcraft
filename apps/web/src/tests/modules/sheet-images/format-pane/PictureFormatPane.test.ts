import { createAppI18n } from "../../../../shared/i18n";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import { Input } from "tdesign-vue-next/es/input";
import { Select } from "tdesign-vue-next/es/select";
import { Button } from "tdesign-vue-next/es/button";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import PictureFormatPane from "../../../../modules/sheet-images/components/format-pane/PictureFormatPane.vue";
import PictureFormatNumberField from "../../../../modules/sheet-images/components/format-pane/PictureFormatNumberField.vue";
import NumericField from "../../../../shared/numeric-field/NumericField.vue";
import {
  type PictureFormatCapabilities,
  type PictureFormatIntent,
  type PictureFormatNumberField as NumberField,
  type PictureFormatSnapshot,
  type PictureFormatTranslate,
} from "../../../../modules/sheet-images/picture-format-pane-model";
const wrappers: VueWrapper[] = [];
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.replaceChildren();
});
const t: PictureFormatTranslate = (key) => key;
function snapshot(): PictureFormatSnapshot {
  return {
    owner: {
      workbookId: "book",
      sheetId: "sheet",
      pictureId: "picture",
      assetId: "asset",
      sessionId: "session",
    },
    revision: 1,
    name: "Synthetic picture",
    originalSizePt: { width: 270, height: 180 },
    values: {
      sizeWidthPt: 270,
      sizeHeightPt: 180,
      rotationDeg: 37,
      scaleWidthPercent: 100,
      scaleHeightPercent: 100,
      lockAspectRatio: true,
      relativeToOriginalSize: true,
      anchor: "move",
      printObject: true,
      locked: true,
      altTitle: "",
      altDescription: "synthetic",
      sourceWidthPt: 324,
      sourceHeightPt: 216,
      sourceOffsetXPt: 36,
      sourceOffsetYPt: 18,
      cropWidthPt: 252,
      cropHeightPt: 180,
      cropLeftPt: 138.24,
      cropTopPt: 51.84,
      lineMode: "solid",
      lineColor: "#FF0000",
      lineWidthPt: 0.75,
      lineTransparencyPercent: 0,
      shadowBlurPt: 5,
      shadowAngleDeg: 45,
    },
  };
}
const capabilities: PictureFormatCapabilities = {
  fields: {
    sizeWidthPt: { enabled: true },
    sizeHeightPt: { enabled: true },
    rotationDeg: { enabled: true },
    scaleWidthPercent: { enabled: true },
    scaleHeightPercent: { enabled: true },
    lockAspectRatio: { enabled: true },
    altTitle: { enabled: true },
    altDescription: { enabled: true },
    sourceWidthPt: { enabled: true },
    sourceHeightPt: { enabled: true },
    sourceOffsetXPt: { enabled: true },
    sourceOffsetYPt: { enabled: true },
    cropWidthPt: { enabled: true },
    cropHeightPt: { enabled: true },
    cropLeftPt: { enabled: true },
    cropTopPt: { enabled: true },
    lineMode: { enabled: true },
    lineWidthPt: { enabled: true },
    shadowBlurPt: { enabled: true },
    shadowAngleDeg: { enabled: true },
    perspectiveDeg: {
      enabled: false,
      reason: "Perspective requires a supported perspective projection",
    },
  },
  resets: {
    "reset-size": { enabled: true },
    "reset-picture": { enabled: true },
    "reset-crop": { enabled: true },
    "reset-3d-format": { enabled: true },
    "reset-3d-rotation": { enabled: true },
  },
};
function fixture(overrides: Record<string, unknown> = {}) {
  const onIntent = vi.fn((_intent: PictureFormatIntent) => true);
  const wrapper = mount(PictureFormatPane, {
    attachTo: document.body,
    props: { snapshot: snapshot(), capabilities, onIntent, t, ...overrides },
    // The shared palette is stubbed; this pane test covers the resolved-color field callback.
    global: {
      plugins: [createAppI18n("en-US")],
      stubs: {
        ColorPaletteSelect: {
          props: ["modelValue", "disabled", "label"],
          emits: ["select"],
          template: '<button type="button" :disabled="disabled" :aria-label="label" />',
        },
      },
    },
  });
  wrappers.push(wrapper);
  return { wrapper, onIntent };
}
function number(wrapper: VueWrapper, field: NumberField) {
  return wrapper
    .findAllComponents(PictureFormatNumberField)
    .find((component) => component.props("field") === field)!;
}
function input(wrapper: VueWrapper, field: NumberField) {
  return number(wrapper, field).getComponent(Input).get<HTMLInputElement>("input");
}
function reveal(wrapper: VueWrapper, label: string) {
  const button = wrapper
    .findAll(".format-section__heading")
    .find((item) => item.text() === label)!;
  return button.trigger("click");
}
describe("active-page picture format feedback", () => {
  test("other pages cannot promote or hide a current single-field reason", () => {
    const { wrapper } = fixture({
      capabilities: {
        ...capabilities,
        fields: {
          ...capabilities.fields,
          sizeWidthPt: { enabled: false, reason: "Protected width" },
          sourceWidthPt: { enabled: false, reason: "Protected width" },
          lineColor: { enabled: false, reason: "Theme outline" },
          lineWidthPt: { enabled: false, reason: "Theme outline" },
        },
      },
    });
    expect(wrapper.find(".picture-format-pane__status").exists()).toBe(false);
    const feedback = number(wrapper, "sizeWidthPt").get(".field-feedback");
    expect(feedback.text()).toBe("Protected width");
    expect(feedback.classes()).not.toContain("field-feedback--description-only");
    expect(input(wrapper, "sizeWidthPt").attributes("disabled")).toBeDefined();
  });
  test("switching pages aggregates only the actual detailed editor branch", async () => {
    const { wrapper } = fixture({
      capabilities: {
        ...capabilities,
        detailed: {
          fill: { enabled: false, reason: "Paint unavailable" },
          line: { enabled: false, reason: "Paint unavailable" },
          shadow: { enabled: false, reason: "Effects protected" },
          glow: { enabled: false, reason: "Effects protected" },
        },
        fields: {
          ...capabilities.fields,
          lineColor: { enabled: false, reason: "Legacy theme outline" },
          lineWidthPt: { enabled: false, reason: "Legacy theme outline" },
        },
      },
    });
    expect(wrapper.find(".picture-format-pane__status").exists()).toBe(false);
    wrapper.vm.showPaint("line");
    await flushPromises();
    expect(wrapper.get(".picture-format-pane__status").text()).toBe("Paint unavailable");
    wrapper.vm.showEffects();
    await flushPromises();
    expect(wrapper.get(".picture-format-pane__status").text()).toBe("Effects protected");
  });
  test("current repeated protection stays visible and single unsupported feedback stays local", async () => {
    const { wrapper } = fixture({
      capabilities: {
        ...capabilities,
        fields: {
          ...capabilities.fields,
          sizeWidthPt: { enabled: false, reason: "Sheet is protected" },
          sizeHeightPt: { enabled: false, reason: "Sheet is protected" },
          altTitle: { enabled: false, reason: "Title is unsupported" },
        },
      },
    });
    expect(wrapper.get(".picture-format-pane__status").text()).toBe("Sheet is protected");
    const width = input(wrapper, "sizeWidthPt");
    expect(width.attributes("disabled")).toBeDefined();
    const descriptionId = width.attributes("aria-describedby");
    if (!descriptionId) throw new Error("Width field is missing its feedback reference");
    expect(document.getElementById(descriptionId)?.textContent).toBe("Sheet is protected");
    await reveal(wrapper, "altTextSection");
    const title = wrapper.get('[data-picture-format-field="altTitle"]');
    const feedback = title.element.closest(".picture-format-field")!.querySelector("p")!;
    expect(feedback.textContent).toBe("Title is unsupported");
    expect(feedback.classList.contains("is-shared")).toBe(false);
  });
});
test("paired size and scale steppers retain decimal drafts and unit conversion", async () => {
  const { wrapper, onIntent } = fixture();
  for (const [unit, step, expected] of [
    ["pt", 1, 2.125],
    ["in", 0.1, 153],
    ["cm", 0.1, (2.125 * 72) / 2.54],
  ] as const) {
    const chooser = wrapper
      .findAllComponents(Select)
      .find((select) => "data-picture-format-units" in select.attributes())!;
    chooser.vm.$emit("change", unit);
    await flushPromises();
    for (const field of ["sizeWidthPt", "sizeHeightPt"] as const) {
      expect(number(wrapper, field).getComponent(NumericField).props("spec").displayStep).toBe(
        step,
      );
      await input(wrapper, field).setValue("2.125");
      await input(wrapper, field).trigger("keydown", { key: "Enter" });
      expect(onIntent.mock.calls.at(-1)?.[0]).toMatchObject({ field, value: expected });
    }
  }
  for (const field of ["scaleWidthPercent", "scaleHeightPercent"] as const) {
    expect(number(wrapper, field).getComponent(NumericField).props("spec").displayStep).toBe(1);
    await input(wrapper, field).setValue("112.375");
    await input(wrapper, field).trigger("keydown", { key: "Enter" });
    expect(onIntent.mock.calls.at(-1)?.[0]).toMatchObject({ field, value: 112.375 });
  }
});
describe("picture format pane concrete four-page form", () => {
  test("the supplied theme-inheritance line choice reaches the owner exactly once while disabled or unknown modes do not", async () => {
    const { wrapper, onIntent } = fixture({
      options: {
        lineMode: [
          { value: "inherit", label: "Theme outline" },
          { value: "none", label: "No line" },
          { value: "solid", label: "Local solid" },
          { value: "gradient", label: "Gradient", disabled: true },
        ],
      },
    });
    const choice = wrapper
      .findAllComponents(Select)
      .find((item) => item.attributes("data-picture-format-field") === "lineMode")!;
    choice.vm.$emit("change", "gradient");
    choice.vm.$emit("change", "unknown");
    expect(onIntent).not.toHaveBeenCalled();
    choice.vm.$emit("change", "inherit");
    await flushPromises();
    expect(onIntent).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ type: "set-field", field: "lineMode", value: "inherit" }),
    );
  });
  test("renders the four actual tabs and all crop/effect/property fields with distinct reset controls", () => {
    const { wrapper } = fixture();
    expect(wrapper.findAll('[role="tab"]').map((tab) => tab.text())).toEqual([
      "fillLineTab",
      "effectsTab",
      "sizePropertiesTab",
      "pictureTab",
    ]);
    for (const field of [
      "sourceWidthPt",
      "sourceHeightPt",
      "sourceOffsetXPt",
      "sourceOffsetYPt",
      "cropWidthPt",
      "cropHeightPt",
      "cropLeftPt",
      "cropTopPt",
      "scaleWidthPercent",
      "scaleHeightPercent",
      "rotation3dXDeg",
      "perspectiveDeg",
      "depthSizePt",
      "contourSizePt",
      "reflectionSizePercent",
      "softEdgeSizePt",
      "glowTransparencyPercent",
    ] as const)
      expect(number(wrapper, field).exists()).toBe(true);
    for (const type of [
      "reset-size",
      "reset-picture",
      "reset-crop",
      "reset-3d-format",
      "reset-3d-rotation",
    ])
      expect(wrapper.find(`[data-picture-format-reset="${type}"]`).exists()).toBe(true);
    expect(wrapper.find('[data-picture-format-field="anchor"]').exists()).toBe(true);
    expect(wrapper.find('[data-picture-format-field="altDescription"]').exists()).toBe(true);
  });
  test("missing field capabilities and missing preset catalogs stay truthfully disabled", () => {
    const { wrapper } = fixture();
    expect(number(wrapper, "perspectiveDeg").getComponent(Input).props("disabled")).toBe(true);
    expect(number(wrapper, "perspectiveDeg").text()).toContain(
      "Perspective requires a supported perspective projection",
    );
    const preset = wrapper
      .findAllComponents(Select)
      .find((select) => select.attributes("data-picture-format-field") === "material")!;
    expect(preset.props("disabled")).toBe(true);
    expect(preset.props("options")).toEqual([]);
    expect(number(wrapper, "glowSizePt").getComponent(Input).props("modelValue")).toBe("");
  });
  test("an explicitly empty built-in line catalog remains disabled rather than regaining unsupported modes", () => {
    const { wrapper } = fixture({ options: { lineMode: [] } });
    const lineMode = wrapper
      .findAllComponents(Select)
      .find((item) => item.attributes("data-picture-format-field") === "lineMode")!;
    expect(lineMode.props("options")).toEqual([]);
    expect(lineMode.props("disabled")).toBe(true);
  });
  test("empty/mixed derived dimensions render blank, never invented zeros", () => {
    const { wrapper } = fixture({ snapshot: { ...snapshot(), values: {} } });
    expect(input(wrapper, "sizeWidthPt").element.value).toBe("");
    const checkbox = wrapper
      .findAllComponents(Checkbox)
      .find((item) => item.attributes("data-picture-format-field") === "lockAspectRatio")!;
    expect(checkbox.props("indeterminate")).toBe(true);
  });
  test("no selected owner has no active edit fields or phantom snapshot", () => {
    const { wrapper, onIntent } = fixture({ snapshot: null });
    expect(wrapper.text()).toContain("noSelection");
    expect(wrapper.findAllComponents(PictureFormatNumberField)).toHaveLength(0);
    expect(onIntent).not.toHaveBeenCalled();
  });
  test("tab arrows/Home/End use roving focus, keep labelled panels mounted", async () => {
    const { wrapper } = fixture();
    const tabs = wrapper.findAll<HTMLButtonElement>('[role="tab"]');
    tabs[2]!.element.focus();
    await tabs[2]!.trigger("keydown", { key: "ArrowRight" });
    expect(tabs[3]!.attributes("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tabs[3]!.element);
    await tabs[3]!.trigger("keydown", { key: "Home" });
    expect(tabs[0]!.attributes("tabindex")).toBe("0");
    await tabs[0]!.trigger("keydown", { key: "End" });
    expect(tabs[3]!.attributes("tabindex")).toBe("0");
    expect(wrapper.findAll('[role="tabpanel"]')).toHaveLength(4);
    for (const panel of wrapper.findAll('[role="tabpanel"]'))
      expect(panel.attributes("aria-labelledby")).toBeTruthy();
  });
  test("units apply only to geometric lengths, not degree/point effect numbers", async () => {
    const { wrapper, onIntent } = fixture({ initialUnit: "in" });
    expect(input(wrapper, "sizeWidthPt").element.value).toBe("3.75");
    expect(input(wrapper, "shadowBlurPt").element.value).toBe("5");
    await input(wrapper, "sourceOffsetXPt").setValue("-.5");
    await input(wrapper, "sourceOffsetXPt").trigger("keydown", { key: "Enter" });
    expect(onIntent.mock.calls.at(-1)?.[0]).toMatchObject({ field: "sourceOffsetXPt", value: -36 });
    await input(wrapper, "rotationDeg").setValue("60");
    await input(wrapper, "rotationDeg").trigger("keydown", { key: "Enter" });
    expect(onIntent.mock.calls.at(-1)?.[0]).toMatchObject({ field: "rotationDeg", value: 60 });
  });
});
describe("picture format pane draft ownership and real input events", () => {
  test.each(["blur", "Enter"])(
    "typing multi-digit decimals stays focused and commits once on %s",
    async (completion) => {
      const { wrapper, onIntent } = fixture();
      const component = number(wrapper, "sizeWidthPt");
      const field = input(wrapper, "sizeWidthPt");
      field.element.focus();
      await field.setValue("2");
      await field.setValue("20");
      await field.setValue("200.");
      expect(onIntent).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(field.element);
      expect(number(wrapper, "sizeWidthPt").vm.$.uid).toBe(component.vm.$.uid);
      if (completion === "blur") field.element.blur();
      else await field.trigger("keydown", { key: "Enter" });
      await flushPromises();
      expect(onIntent).toHaveBeenCalledTimes(1);
      expect(onIntent.mock.calls[0]?.[0]).toMatchObject({
        type: "set-field",
        field: "sizeWidthPt",
        value: 200,
      });
      await field.trigger("blur");
      expect(onIntent).toHaveBeenCalledTimes(1);
      expect(number(wrapper, "sizeWidthPt").vm.$.uid).toBe(component.vm.$.uid);
    },
  );
  test("owner false preserves draft and displays a clear inline error, cleared by subsequent typing", async () => {
    const rejected = vi.fn(() => false);
    const { wrapper } = fixture({ onIntent: rejected });
    const field = input(wrapper, "sizeWidthPt");
    await field.setValue("210");
    await field.trigger("keydown", { key: "Enter" });
    expect(field.element.value).toBe("210");
    expect(number(wrapper, "sizeWidthPt").get('[role="alert"]').text()).toBe("applyRejected");
    await field.setValue("211");
    expect(number(wrapper, "sizeWidthPt").find('[role="alert"]').exists()).toBe(false);
    expect(rejected).toHaveBeenCalledTimes(1);
  });
  test("malformed/out-of-range drafts remain visible and never reach the host", async () => {
    const { wrapper, onIntent } = fixture();
    const field = input(wrapper, "sizeWidthPt");
    await field.setValue("-");
    await field.trigger("blur");
    expect(number(wrapper, "sizeWidthPt").get('[role="alert"]').text()).toBe("invalidNumber");
    await field.setValue("0");
    await field.trigger("keydown", { key: "Enter" });
    expect(number(wrapper, "sizeWidthPt").get('[role="alert"]').text()).toBe("outOfRange");
    expect(onIntent).not.toHaveBeenCalled();
    expect(field.element.value).toBe("0");
  });
  test("own accepted revisions reconcile without erasing continuous newer typing or remounting", async () => {
    const { wrapper, onIntent } = fixture();
    const component = number(wrapper, "sizeWidthPt");
    const field = input(wrapper, "sizeWidthPt");
    field.element.focus();
    await field.setValue("20");
    await field.trigger("keydown", { key: "Enter" });
    const intent = onIntent.mock.calls[0]![0];
    await field.setValue("200");
    await wrapper.setProps({
      snapshot: {
        ...snapshot(),
        revision: 2,
        acceptedIntentId: intent.intentId,
        values: { ...snapshot().values, sizeWidthPt: 20 },
      },
    });
    expect(field.element.value).toBe("200");
    expect(document.activeElement).toBe(field.element);
    expect(number(wrapper, "sizeWidthPt").vm.$.uid).toBe(component.vm.$.uid);
    await field.trigger("keydown", { key: "Enter" });
    expect(onIntent.mock.calls.at(-1)?.[0]).toMatchObject({
      field: "sizeWidthPt",
      value: 200,
      baseRevision: 2,
    });
  });
  test.each(["workbookId", "sheetId", "pictureId", "assetId", "sessionId"] as const)(
    "%s transition clears old drafts and rejects old rendered callbacks",
    async (ownerField) => {
      const { wrapper, onIntent } = fixture();
      const component = number(wrapper, "sizeWidthPt");
      const field = input(wrapper, "sizeWidthPt");
      await field.setValue("210");
      const oldEnter = component.getComponent(Input).vm.$.vnode.props!.onEnter as () => void;
      const oldEdit = component.getComponent(Input).vm.$.vnode.props!.onChange as (
        value: string,
      ) => void;
      await wrapper.setProps({
        snapshot: { ...snapshot(), owner: { ...snapshot().owner, [ownerField]: "new" } },
      });
      expect(field.element.value).toBe("270");
      oldEdit("999");
      oldEnter();
      expect(onIntent).not.toHaveBeenCalled();
      expect(field.element.value).toBe("270");
      expect(number(wrapper, "sizeWidthPt").vm.$.uid).toBe(component.vm.$.uid);
    },
  );
  test("Escape cancels only the active field draft, close cancels remaining drafts and old callbacks", async () => {
    const { wrapper, onIntent } = fixture();
    const width = input(wrapper, "sizeWidthPt");
    const height = input(wrapper, "sizeHeightPt");
    await width.setValue("210");
    await height.setValue("190");
    await width.trigger("keydown", { key: "Escape" });
    expect(width.element.value).toBe("270");
    expect(height.element.value).toBe("190");
    expect(wrapper.emitted("close")).toBeUndefined();
    const oldEnter = number(wrapper, "sizeHeightPt").getComponent(Input).vm.$.vnode.props!
      .onEnter as () => void;
    await wrapper.get('[aria-label="close"]').trigger("click");
    oldEnter();
    expect(wrapper.emitted("close")).toHaveLength(1);
    expect(wrapper.emitted("cancel")).toHaveLength(1);
    expect(onIntent).not.toHaveBeenCalled();
    expect(height.element.value).toBe("180");
  });
  test("numeric editing temporarily locks the unit chooser against reinterpretation", async () => {
    const { wrapper } = fixture();
    const field = input(wrapper, "sizeWidthPt");
    await field.setValue("20");
    const chooser = wrapper
      .findAllComponents(Select)
      .find((select) => "data-picture-format-units" in select.attributes())!;
    expect(chooser.props("disabled")).toBe(true);
    chooser.vm.$emit("change", "in");
    await flushPromises();
    expect(field.element.value).toBe("20");
    await field.trigger("keydown", { key: "Escape" });
    expect(chooser.props("disabled")).toBe(false);
    chooser.vm.$emit("change", "in");
    await flushPromises();
    expect(field.element.value).toBe("3.75");
  });
  test("text edits commit on blur without filling an empty Title with Description", async () => {
    const { wrapper, onIntent } = fixture();
    await reveal(wrapper, "altTextSection");
    const title = wrapper
      .get('[data-picture-format-field="altTitle"]')
      .get<HTMLInputElement>("input");
    expect(title.element.value).toBe("");
    await title.setValue("Figure 12");
    expect(onIntent).not.toHaveBeenCalled();
    await title.trigger("blur");
    expect(onIntent.mock.calls[0]?.[0]).toMatchObject({ field: "altTitle", value: "Figure 12" });
    const description = wrapper
      .get('[data-picture-format-field="altDescription"]')
      .get<HTMLTextAreaElement>("textarea");
    await description.setValue("First line\nSecond line");
    await description.trigger("blur");
    expect(onIntent.mock.calls.at(-1)?.[0]).toMatchObject({
      field: "altDescription",
      value: "First line\nSecond line",
    });
  });
  test("each reset emits exactly its own intent; rejected reset keeps geometry unchanged", async () => {
    const rejected = vi.fn((_intent: PictureFormatIntent) => false);
    const { wrapper } = fixture({ onIntent: rejected });
    for (const type of [
      "reset-size",
      "reset-picture",
      "reset-crop",
      "reset-3d-format",
      "reset-3d-rotation",
    ] as const) {
      await wrapper.get(`[data-picture-format-reset="${type}"]`).trigger("click");
      expect(rejected.mock.calls.at(-1)?.[0].type).toBe(type);
    }
    expect(input(wrapper, "sourceWidthPt").element.value).toBe("324");
    expect(input(wrapper, "cropWidthPt").element.value).toBe("252");
    expect(input(wrapper, "rotationDeg").element.value).toBe("37");
  });
  test("callback replacement and unmount invalidate previously rendered callbacks", async () => {
    const { wrapper, onIntent } = fixture();
    const field = input(wrapper, "sizeWidthPt");
    await field.setValue("210");
    const oldEnter = number(wrapper, "sizeWidthPt").getComponent(Input).vm.$.vnode.props!
      .onEnter as () => void;
    const replacement = vi.fn(() => true);
    await wrapper.setProps({ onIntent: replacement });
    oldEnter();
    expect(onIntent).not.toHaveBeenCalled();
    expect(replacement).not.toHaveBeenCalled();
    expect(field.element.value).toBe("210");
    await field.setValue("220");
    const unmountedEnter = number(wrapper, "sizeWidthPt").getComponent(Input).vm.$.vnode.props!
      .onEnter as () => void;
    wrapper.unmount();
    wrappers.splice(wrappers.indexOf(wrapper), 1);
    unmountedEnter();
    expect(replacement).not.toHaveBeenCalled();
  });
  test("boolean rejection leaves the controlled value intact and clears its error on acceptance", async () => {
    const handler = vi.fn().mockReturnValueOnce(false).mockReturnValue(true);
    const { wrapper } = fixture({ onIntent: handler });
    const checkbox = wrapper
      .findAllComponents(Checkbox)
      .find((item) => item.attributes("data-picture-format-field") === "lockAspectRatio")!;
    checkbox.vm.$emit("change", false);
    await flushPromises();
    expect(checkbox.props("modelValue")).toBe(true);
    expect(
      wrapper.findAll('[role="alert"]').some((alert) => alert.text() === "applyRejected"),
    ).toBe(true);
    checkbox.vm.$emit("change", false);
    await flushPromises();
    expect(wrapper.findAll('[role="alert"]')).toHaveLength(0);
    expect(handler.mock.calls.at(-1)?.[0]).toMatchObject({
      field: "lockAspectRatio",
      value: false,
    });
  });
  test("explicit preset catalogs disable choices individually and never fabricate unknown choices", async () => {
    const { wrapper, onIntent } = fixture({
      capabilities: {
        ...capabilities,
        fields: { ...capabilities.fields, shadowPreset: { enabled: true } },
      },
      options: {
        lineMode: [
          { value: "none", label: "None" },
          { value: "solid", label: "Solid" },
        ],
        shadowPreset: [
          { value: "none", label: "None" },
          { value: "outer-owner-id", label: "Outer shadow", disabled: true },
        ],
      },
    });
    const select = wrapper
      .findAllComponents(Select)
      .find((item) => item.attributes("data-picture-format-field") === "shadowPreset")!;
    const lineMode = wrapper
      .findAllComponents(Select)
      .find((item) => item.attributes("data-picture-format-field") === "lineMode")!;
    expect(lineMode.props("options")).toEqual([
      { value: "none", label: "None" },
      { value: "solid", label: "Solid" },
    ]);
    select.vm.$emit("change", "outer-owner-id");
    select.vm.$emit("change", "invented");
    expect(onIntent).not.toHaveBeenCalled();
    select.vm.$emit("change", "none");
    expect(onIntent.mock.calls[0]?.[0]).toMatchObject({ field: "shadowPreset", value: "none" });
  });
  test("old checkbox and reset callbacks cannot target a newly selected owner", async () => {
    const { wrapper, onIntent } = fixture();
    const checkbox = wrapper
      .findAllComponents(Checkbox)
      .find((item) => item.attributes("data-picture-format-field") === "lockAspectRatio")!;
    const oldBoolean = checkbox.vm.$.vnode.props!.onChange as (value: boolean) => void;
    const oldReset = wrapper.get('[data-picture-format-reset="reset-size"]').element;
    const resetHandler = wrapper
      .findAllComponents(Button)
      .find((item) => item.attributes("data-picture-format-reset") === "reset-size")!.vm.$.vnode
      .props!.onClick as () => void;
    await wrapper.setProps({
      snapshot: { ...snapshot(), owner: { ...snapshot().owner, sessionId: "replacement" } },
    });
    oldBoolean(false);
    resetHandler();
    expect(onIntent).not.toHaveBeenCalled();
    expect(oldReset.isConnected).toBe(true);
  });
  test("same leaf and asset moving to another actual owner path clears drafts and rejects old callbacks", async () => {
    const { wrapper, onIntent } = fixture({
      snapshot: { ...snapshot(), owner: { ...snapshot().owner, ownerPath: ["outer", "group-a"] } },
    });
    const field = input(wrapper, "sizeWidthPt");
    await field.setValue("210");
    const oldEnter = number(wrapper, "sizeWidthPt").getComponent(Input).vm.$.vnode.props!
      .onEnter as () => void;
    await wrapper.setProps({
      snapshot: { ...snapshot(), owner: { ...snapshot().owner, ownerPath: ["outer", "group-b"] } },
    });
    expect(field.element.value).toBe("270");
    oldEnter();
    expect(onIntent).not.toHaveBeenCalled();
    await field.setValue("220");
    await field.trigger("keydown", { key: "Enter" });
    expect(onIntent.mock.calls[0]?.[0].owner.ownerPath).toEqual(["outer", "group-b"]);
  });
  test.each(["sizeWidthPt", "altTitle"] as const)(
    "an old Escape callback for %s cannot cancel the new owner's draft",
    async (fieldName) => {
      const { wrapper } = fixture();
      const control =
        fieldName === "sizeWidthPt"
          ? number(wrapper, fieldName).getComponent(Input)
          : wrapper
              .findAllComponents(Input)
              .find((item) => item.attributes("data-picture-format-field") === fieldName)!;
      const field = control.get<HTMLInputElement>("input");
      await field.setValue("210");
      const oldKeydown = control.vm.$.vnode.props!.onKeydown as (
        value: string,
        context: { e: KeyboardEvent },
      ) => void;
      await wrapper.setProps({
        snapshot: { ...snapshot(), owner: { ...snapshot().owner, sessionId: "new-escape-owner" } },
      });
      await field.setValue("220");
      oldKeydown("210", { e: new KeyboardEvent("keydown", { key: "Escape" }) });
      await flushPromises();
      expect(field.element.value).toBe("220");
    },
  );
});

describe("selected source original-dimension feedback", () => {
  test("loading dimensions are visible and do not offer a competing retry", () => {
    const { wrapper, onIntent } = fixture({
      snapshot: { ...snapshot(), originalSizePt: undefined },
      intrinsicStatus: "loading",
      retryIntrinsic: vi.fn(),
    });
    expect(wrapper.get("[data-picture-original-status]").text()).toContain("originalSizeLoading");
    expect(wrapper.find("[data-picture-original-retry]").exists()).toBe(false);
    expect(onIntent).not.toHaveBeenCalled();
  });
  test("unavailable source offers explicit retry without dispatching document edits", async () => {
    const retryIntrinsic = vi.fn();
    const { wrapper, onIntent } = fixture({
      snapshot: { ...snapshot(), originalSizePt: undefined },
      intrinsicStatus: "unavailable",
      retryIntrinsic,
    });
    expect(wrapper.get("[data-picture-original-status]").text()).toContain(
      "originalSizeUnavailable",
    );
    await wrapper.get("[data-picture-original-retry]").trigger("click");
    expect(retryIntrinsic).toHaveBeenCalledTimes(1);
    expect(onIntent).not.toHaveBeenCalled();
    await wrapper.setProps({ snapshot: snapshot(), intrinsicStatus: "ready" });
    expect(wrapper.find("[data-picture-original-status]").exists()).toBe(false);
  });
  test("a source-free group does not pretend to have unavailable original dimensions", () => {
    const source = snapshot();
    source.owner.assetId = undefined;
    source.originalSizePt = undefined;
    const { wrapper } = fixture({
      snapshot: source,
      intrinsicStatus: "unavailable",
      retryIntrinsic: vi.fn(),
    });
    expect(wrapper.find("[data-picture-original-status]").exists()).toBe(false);
  });
});

test("paint quick entry expands the requested actual section and preserves an unfinished numeric draft", async () => {
  const { wrapper, onIntent } = fixture();
  const width = input(wrapper, "sizeWidthPt");
  await width.trigger("focus");
  await width.setValue("2");
  await width.setValue("20");
  const element = width.element;
  wrapper.vm.showPaint("fill");
  await flushPromises();
  expect(
    wrapper
      .findAll('[role="tab"]')
      .find((tab) => tab.text() === "fillLineTab")!
      .attributes("aria-selected"),
  ).toBe("true");
  expect(
    wrapper
      .findAll(".format-section__heading")
      .find((button) => button.text() === "fillSection")!
      .attributes("aria-expanded"),
  ).toBe("true");
  expect(input(wrapper, "sizeWidthPt").element).toBe(element);
  expect(input(wrapper, "sizeWidthPt").element.value).toBe("20");
  expect(onIntent).not.toHaveBeenCalled();
});
test("first paint quick entry opens fill-line and fill immediately without a remount", () => {
  const { wrapper } = fixture({ initialPaint: "fill" });
  expect(
    wrapper
      .findAll('[role="tab"]')
      .find((tab) => tab.text() === "fillLineTab")!
      .attributes("aria-selected"),
  ).toBe("true");
  expect(
    wrapper
      .findAll(".format-section__heading")
      .find((button) => button.text() === "fillSection")!
      .attributes("aria-expanded"),
  ).toBe("true");
});
test("shape gallery retains its selection and failed draft across rejection, with a stable owner callback", async () => {
  const refused = vi.fn(() => false);
  const { wrapper } = fixture({
    initialTab: "picture",
    capabilities: { ...capabilities, cropShape: { enabled: true } },
    onIntent: refused,
  });
  const trigger = wrapper.get('.picture-crop-shape [aria-haspopup="menu"]');
  await trigger.trigger("click");
  await flushPromises();
  const pick = () =>
    document.querySelector<HTMLButtonElement>('[data-picture-crop-shape="ellipse"]')!;
  expect(pick()).not.toBeNull();
  pick().click();
  await flushPromises();
  expect(refused).toHaveBeenCalledOnce();
  expect(document.querySelector(".picture-crop-shape__menu")).not.toBeNull();
  expect(document.querySelector(".picture-crop-shape__error")?.textContent).toContain(
    "applyRejected",
  );
  refused.mockReturnValue(true);
  pick().click();
  await flushPromises();
  expect(refused).toHaveBeenCalledTimes(2);
  expect(document.querySelector(".picture-crop-shape__menu")).toBeNull();
});
test("pane blocks pointer focus and the following click when pending crop application refuses", async () => {
  const beforeInteraction = vi.fn(() => false),
    { wrapper, onIntent } = fixture({ beforeInteraction });
  const reset = wrapper.get('[data-picture-format-reset="reset-size"]');
  await reset.trigger("pointerdown", { button: 0 });
  await reset.trigger("click");
  expect(beforeInteraction).toHaveBeenCalledOnce();
  expect(onIntent).not.toHaveBeenCalled();
  beforeInteraction.mockReturnValue(true);
  await reset.trigger("pointerdown", { button: 0 });
  await reset.trigger("click");
  expect(onIntent).toHaveBeenCalledOnce();
  expect(beforeInteraction.mock.invocationCallOrder[1]).toBeLessThan(
    onIntent.mock.invocationCallOrder[0]!,
  );
});

test("effects entry opens the Effects tab without editing the document", async () => {
  const { wrapper, onIntent } = fixture({ initialTab: "effects" });
  expect(wrapper.get('[role="tab"][aria-selected="true"]').text()).toBe("effectsTab");
  await wrapper
    .findAll('[role="tab"]')
    .find((tab) => tab.text() === "sizePropertiesTab")!
    .trigger("click");
  wrapper.vm.showEffects();
  await wrapper.vm.$nextTick();
  expect(wrapper.get('[role="tab"][aria-selected="true"]').text()).toBe("effectsTab");
  expect(onIntent).not.toHaveBeenCalled();
});
