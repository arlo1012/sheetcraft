import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { afterEach, expect, test, vi } from "vitest";
import type { Choice, PictureShadow } from "@sheetcraft/core/picture-detailed-style";
import PictureShadowEditor from "../../../../modules/sheet-images/components/format-pane/PictureShadowEditor.vue";
import PicturePaintNumber from "../../../../modules/sheet-images/components/format-pane/PicturePaintNumber.vue";
import NumericField from "../../../../shared/numeric-field/NumericField.vue";
import { getPictureEffectPreset } from "../../../../modules/sheet-images/picture-effect-presets";
import { createAppI18n } from "../../../../shared/i18n";

const wrappers: VueWrapper[] = [];
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.replaceChildren();
});
function fixture(perspective = false) {
  const preset = getPictureEffectPreset("shadow", "outer-bottom-right")!;
  if (preset.kind !== "value") throw Error("Missing shadow preset");
  const value: Choice<PictureShadow> = perspective
    ? {
        kind: "value",
        value: {
          ...preset.value,
          kind: "perspective",
          scaleX: 1,
          scaleY: 1,
          skewXDeg: 12.3456789,
          originX: 0.5,
          originY: 0.5,
        },
      }
    : preset;
  const commit = vi.fn((_value: Choice<PictureShadow> | undefined) => true);
  const wrapper = mount(PictureShadowEditor, {
    attachTo: document.body,
    props: { ownerKey: "picture-a", value, t: (key) => key, onCommit: commit },
    global: { plugins: [createAppI18n("en-US")] },
  });
  wrappers.push(wrapper);
  const field = (label: string) =>
    wrapper.findAllComponents(PicturePaintNumber).find((item) => item.props("label") === label)!;
  return { wrapper, commit, field, preset };
}

test("shadow fields compact only their display and leave untouched preset precision intact", async () => {
  const f = fixture(true);
  expect(f.preset.value.distancePt).toBe(Math.hypot(1, 1) * 3);
  const cases = [
    ["shadowDistancePt", "4.24", "pt"],
    ["shadowBlurPt", "4", "pt"],
    ["shadowAngleDeg", "45", "°"],
    ["shadowSkew", "12.35", "°"],
  ];
  for (const [label, expected, unit] of cases) {
    const field = f.field(label!);
    const input = field.get<HTMLInputElement>("input");
    expect(field.props("displayPrecision")).toBe(2);
    expect(input.element.value).toBe(expected);
    expect(input.attributes("aria-valuetext")).toBe(`${expected} ${unit}`);
    input.element.focus();
    await input.trigger("keydown", { key: "Enter" });
    input.element.blur();
    await flushPromises();
    expect(field.getComponent(NumericField).vm.hasPending()).toBe(false);
  }
  expect(f.commit).not.toHaveBeenCalled();
  expect(f.preset.value.distancePt).toBe(Math.hypot(1, 1) * 3);
  expect(f.field("shadowTransparencyPercent").props("displayPrecision")).toBe(12);
});

test("shadow distance step starts from the exact accepted value, not the rounded display", async () => {
  const f = fixture();
  await f.field("shadowDistancePt").get('button[aria-label="shadowDistancePt +"]').trigger("click");
  await flushPromises();
  expect(f.commit).toHaveBeenCalledTimes(1);
  const result = f.commit.mock.calls[0]![0]!;
  expect(result).toMatchObject({
    kind: "value",
    value: { distancePt: Number((Math.hypot(1, 1) * 3 + 1).toPrecision(15)) },
  });
  expect(f.field("shadowDistancePt").get<HTMLInputElement>("input").element.value).toBe("5.24");
});

test("shadow edits retain full typed precision, invalid drafts, cancel, and retired owner guards", async () => {
  const f = fixture();
  const field = f.field("shadowDistancePt");
  const input = field.get<HTMLInputElement>("input");
  input.element.focus();
  await input.setValue("6.1234567890123");
  expect(input.element.value).toBe("6.1234567890123");
  await input.trigger("keydown", { key: "Enter" });
  await flushPromises();
  expect(f.commit).toHaveBeenCalledTimes(1);
  expect(f.commit.mock.calls[0]![0]).toMatchObject({
    kind: "value",
    value: { distancePt: 6.1234567890123 },
  });
  expect(input.element.value).toBe("6.12");
  await input.setValue("-");
  await input.trigger("keydown", { key: "Enter" });
  expect(input.element.value).toBe("-");
  expect(f.commit).toHaveBeenCalledTimes(1);
  await input.trigger("keydown", { key: "Escape" });
  expect(input.element.value).toBe("6.12");
  await input.setValue("8.7654321");
  const oldCommit = field.getComponent(NumericField).props("onCommit");
  const replacement = vi.fn(() => true);
  await f.wrapper.setProps({ ownerKey: "picture-b", onCommit: replacement });
  expect(
    oldCommit(
      { kind: "value", value: 8.7654321 },
      { ownerKey: "picture-a:shadow:outer", sessionId: "old", source: "blur" },
    ),
  ).toMatchObject({ accepted: false });
  input.element.blur();
  await flushPromises();
  expect(replacement).not.toHaveBeenCalled();
  expect(f.commit).toHaveBeenCalledTimes(1);
  expect(input.element.value).toBe("4.24");
});
