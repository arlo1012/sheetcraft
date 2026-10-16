import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createAppI18n } from "../../../../shared/i18n";
import PictureFormatPane from "../../../../modules/sheet-images/components/format-pane/PictureFormatPane.vue";
import PictureFormatCheckbox from "../../../../modules/sheet-images/components/format-pane/PictureFormatCheckbox.vue";
import PictureEffectPresetField from "../../../../modules/sheet-images/components/format-pane/PictureEffectPresetField.vue";
import PicturePresetChoices from "../../../../modules/sheet-images/components/format-pane/PicturePresetChoices.vue";
import type {
  PictureFormatCapabilities,
  PictureFormatIntent,
  PictureFormatSnapshot,
} from "../../../../modules/sheet-images/picture-format-pane-model";
vi.mock("../../../../modules/sheet-images/picture-preset-preview", () => ({
  picturePresetPreview: () => "data:image/png;base64,c2FtcGxl",
}));
// happy-dom has no layout. TDesign deliberately closes a popup whose trigger
// rectangle is 0x0; supply visible trigger geometry for these interaction tests.
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    width: 132,
    height: 28,
    top: 0,
    right: 132,
    bottom: 28,
    left: 0,
    toJSON: () => ({}),
  });
});
const wrappers: VueWrapper[] = [];
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
const snapshot: PictureFormatSnapshot = {
  owner: {
    workbookId: "book",
    sheetId: "sheet",
    pictureId: "picture",
    assetId: "asset",
    sessionId: "session",
  },
  revision: 1,
  values: {},
  name: "Picture 1",
  appearance: {},
};
function fixture(capabilities: PictureFormatCapabilities) {
  const onIntent = vi.fn((_intent: PictureFormatIntent) => true);
  const wrapper = mount(PictureFormatPane, {
    attachTo: document.body,
    props: { snapshot, capabilities, onIntent, t: (key) => key, initialTab: "effects" },
    global: { plugins: [createAppI18n("en-US")] },
  });
  wrappers.push(wrapper);
  return { wrapper, onIntent };
}
test.each(["shadow", "reflection", "glow", "softEdges", "rotation3d"] as const)(
  "%s header preset uses the native picker while all six effects sections stay collapsed",
  async (category) => {
    const { wrapper, onIntent } = fixture({
      fields: {},
      detailed: {
        shadow: { enabled: true },
        reflection: { enabled: true },
        glow: { enabled: true },
        softEdges: { enabled: true },
        rotation3d: { enabled: true },
        format3d: { enabled: true },
      },
    });
    const headings = wrapper.findAll(".picture-format-effects .picture-format-section__heading");
    expect(headings).toHaveLength(6);
    expect(headings.every((heading) => heading.attributes("aria-expanded") === "false")).toBe(true);
    const presets = wrapper.findAllComponents(PictureEffectPresetField);
    expect(presets).toHaveLength(5);
    const preset = presets.find((preset) => preset.props("category") === category)!;
    expect(preset.element.closest("button")).toBeNull();
    const trigger = preset.get<HTMLInputElement>('input[role="combobox"]');
    trigger.element.focus();
    await flushPromises();
    expect(document.activeElement).toBe(trigger.element);
    await trigger.trigger("keydown", { key: "ArrowDown", code: "ArrowDown", keyCode: 40 });
    await flushPromises();
    expect(preset.get('input[role="combobox"]').attributes("aria-expanded")).toBe("true");
    const choices = wrapper.getComponent(PicturePresetChoices);
    await choices.findAll("button")[0]!.trigger("click");
    expect(onIntent).toHaveBeenCalledTimes(1);
    expect(onIntent.mock.calls[0]![0]).toMatchObject({
      type: "set-detailed",
      category,
      value: { kind: "none" },
      baseRevision: 1,
      owner: snapshot.owner,
    });
    expect(headings.every((heading) => heading.attributes("aria-expanded") === "false")).toBe(true);
  },
);
test("shared disabled reasons are centralized while unique descriptions stay beside their field", async () => {
  const reason = "The sheet is protected";
  const unique = "Original picture scale is unavailable";
  const { wrapper, onIntent } = fixture({
    fields: {
      sizeWidthPt: { enabled: false, reason },
      sizeHeightPt: { enabled: false, reason },
      scaleWidthPercent: { enabled: false, reason: unique },
    },
    detailed: { shadow: { enabled: false, reason } },
  });
  expect(wrapper.get(".picture-format-pane__status").text()).toBe(reason);
  const numericDescriptions = wrapper
    .findAll(".numeric-field input[aria-describedby]")
    .flatMap((input) =>
      input
        .attributes("aria-describedby")!
        .split(/\s+/)
        .map((id) => {
          const description = document.getElementById(id);
          expect(description).not.toBeNull();
          expect(document.querySelectorAll(`[id="${id}"]`)).toHaveLength(1);
          return description!;
        }),
    );
  const sharedNumeric = numericDescriptions.filter((field) => field.textContent === reason);
  expect(sharedNumeric.length).toBeGreaterThan(1);
  for (const description of sharedNumeric)
    expect(description.classList.contains("field-feedback--description-only")).toBe(true);
  const sharedLegacy = wrapper.findAll(".picture-format-field__feedback.is-shared");
  for (const field of sharedLegacy) expect(field.attributes("id")).toBeTruthy();
  const uniqueField = numericDescriptions.find((field) => field.textContent === unique)!;
  expect(uniqueField).toBeDefined();
  expect(uniqueField.classList.contains("field-feedback--description-only")).toBe(false);
  const preset = wrapper.getComponent(PictureEffectPresetField);
  expect(preset.get("input").attributes("disabled")).toBeDefined();
  expect(onIntent).not.toHaveBeenCalled();
});

test("all remaining capability outlets keep a real accessible description while shared reasons are visually centralized", () => {
  const reason = "The sheet is protected";
  const { wrapper, onIntent } = fixture({
    fields: { lockAspectRatio: { enabled: false, reason }, anchor: { enabled: false, reason } },
    resets: { "reset-size": { enabled: false, reason } },
    detailed: { fill: { enabled: false, reason }, line: { enabled: false, reason } },
    cropShape: { enabled: false, reason },
  });
  expect(wrapper.get(".picture-format-pane__status").text()).toBe(reason);
  const checkbox = wrapper
    .findAllComponents(PictureFormatCheckbox)
    .find((field) => field.props("field") === "lockAspectRatio")!;
  const controls = [
    checkbox.get("input"),
    wrapper.get('[data-picture-format-reset="reset-size"]'),
    wrapper.get('[role="radiogroup"][aria-label="anchor"]'),
    wrapper.get('[role="group"][aria-label="fillSection"]'),
    wrapper.get('[role="group"][aria-label="lineSection"]'),
    wrapper.get('[role="group"][aria-label="Crop to shape"]'),
  ];
  for (const control of controls) {
    const id = control.attributes("aria-describedby");
    expect(id).toBeTruthy();
    const description = wrapper.get(`#${id}`);
    expect(description.text()).toBe(reason);
    expect(description.classes()).toContain("is-description-only");
    expect(description.attributes("aria-hidden")).toBeUndefined();
    expect(description.attributes("hidden")).toBeUndefined();
  }
  expect(onIntent).not.toHaveBeenCalled();
});
