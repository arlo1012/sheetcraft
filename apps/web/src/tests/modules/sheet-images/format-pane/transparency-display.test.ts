import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { defineComponent, h, nextTick, ref } from "vue";
import { expect, test, vi } from "vitest";
import {
  normalizeDetailedPictureStyle,
  type Choice,
  type PicturePaint,
} from "@sheetcraft/core/picture-detailed-style";
import PicturePaintEditor from "../../../../modules/sheet-images/components/format-pane/PicturePaintEditor.vue";
import NumericField from "../../../../shared/numeric-field/NumericField.vue";
import PicturePaintNumber from "../../../../modules/sheet-images/components/format-pane/PicturePaintNumber.vue";
import PictureGradientEditor from "../../../../modules/sheet-images/components/format-pane/PictureGradientEditor.vue";
import PictureShadowEditor from "../../../../modules/sheet-images/components/format-pane/PictureShadowEditor.vue";
import PictureGlowEditor from "../../../../modules/sheet-images/components/format-pane/PictureGlowEditor.vue";
import PictureReflectionEditor from "../../../../modules/sheet-images/components/format-pane/PictureReflectionEditor.vue";
import FormatSection from "../../../../shared/format-pane/FormatSection.vue";
import { createAppI18n } from "../../../../shared/i18n";
import {
  createPictureGradientPaint,
  createPictureSolidPaint,
} from "../../../../modules/sheet-images/picture-paint-edit";
import {
  createPictureShadow,
  createPictureGlow,
  createPictureReflection,
} from "../../../../modules/sheet-images/picture-effect-edit";

function opacityInput(wrapper: VueWrapper, label = "paintOpacity") {
  return wrapper
    .findAllComponents(PicturePaintNumber)
    .find((field) => field.props("label") === label)!
    .get<HTMLInputElement>("input");
}

test("opacity percentages redisplay cleanly through collapse/remount without rounding accepted high-precision ratios", async () => {
  const wrappers: VueWrapper[] = [];
  const paint = ref<Choice<PicturePaint>>({ kind: "value", value: createPictureSolidPaint() });
  const visible = ref(true);
  const owner = ref("shape-fill");
  const reject = { value: false };
  const commit = vi.fn((value: Choice<PicturePaint> | undefined) => {
    if (reject.value) return false;
    const normalized = normalizeDetailedPictureStyle({ fill: value });
    if (!normalized?.fill) return false;
    paint.value = normalized.fill;
    return true;
  });
  const wrapper = mount(
    defineComponent({
      setup: () => () =>
        h(
          FormatSection,
          { title: "Fill", initiallyOpen: true },
          {
            default: () =>
              visible.value
                ? h(PicturePaintEditor, {
                    ownerKey: owner.value,
                    value: paint.value,
                    t: (key) => key,
                    onCommit: commit,
                  })
                : null,
          },
        ),
    }),
    { attachTo: document.body, global: { plugins: [createAppI18n("en-US")] } },
  );
  wrappers.push(wrapper);
  const alpha = () => (paint.value.kind === "value" ? paint.value.value.opacity : NaN);
  function sliderPosition(expected: number) {
    const field = wrapper
      .findAllComponents(PicturePaintNumber)
      .find((f) => f.props("label") === "paintOpacity")!;
    const track = field.get<HTMLElement>(".t-slider__track").element;
    const thumb = field.get<HTMLElement>(".t-slider__button-wrapper").element;
    expect(parseFloat(track.style.width)).toBeCloseTo(expected, 9);
    expect(parseFloat(thumb.style.left)).toBeCloseTo(expected, 9);
  }
  async function collapseAndRemount(expected: string) {
    await wrapper.get(".format-section__heading").trigger("click");
    await wrapper.get(".format-section__heading").trigger("click");
    await flushPromises();
    expect(opacityInput(wrapper).element.value).toBe(expected);
    sliderPosition(Number(expected));
    visible.value = false;
    await nextTick();
    visible.value = true;
    await flushPromises();
    expect(opacityInput(wrapper).element.value).toBe(expected);
    // The retained step=1 Slider projects its initial thumb to a discrete tick.
    // That public-library presentation must not round the numeric draft/model.
    sliderPosition(Math.round(Number(expected)));
    expect(opacityInput(wrapper).attributes("value")).toBe(expected);
    expect(opacityInput(wrapper).attributes("aria-valuetext")).toBe(`${expected} %`);
    expect(
      wrapper
        .findAllComponents(NumericField)
        .find((field) => field.props("label") === "paintOpacity")!
        .vm.hasPending(),
    ).toBe(false);
  }
  try {
    let input = opacityInput(wrapper);
    await input.setValue("20");
    await input.trigger("keydown", { key: "Enter", code: "Enter" });
    await flushPromises();
    expect(alpha()).toBe(0.8);
    sliderPosition(20);
    expect(commit).toHaveBeenCalledTimes(1);
    await collapseAndRemount("20");
    expect(commit).toHaveBeenCalledTimes(1);
    input = opacityInput(wrapper);
    await input.setValue("15.5");
    await input.trigger("keydown", { key: "Enter", code: "Enter" });
    await flushPromises();
    expect(alpha()).toBe(0.845);
    sliderPosition(15.5);
    await collapseAndRemount("15.5");
    expect(commit).toHaveBeenCalledTimes(2);
    const high = Number("0.12345678901234567");
    paint.value = normalizeDetailedPictureStyle({
      fill: { kind: "value", value: { ...createPictureSolidPaint(), opacity: high } },
    })!.fill!;
    await flushPromises();
    const shown = String(Number(((1 - high) * 100).toFixed(12)));
    await collapseAndRemount(shown);
    input = opacityInput(wrapper);
    input.element.focus();
    input.element.blur();
    await flushPromises();
    expect(alpha()).toBe(high);
    expect(commit).toHaveBeenCalledTimes(2);
    const typed = "15.123456789012345";
    input = opacityInput(wrapper);
    await input.setValue(typed);
    await input.trigger("keydown", { key: "Enter", code: "Enter" });
    await flushPromises();
    expect(alpha()).toBe(1 - Number(typed) / 100);
    expect(alpha()).not.toBe(1 - Number(Number(typed).toFixed(12)) / 100);
    expect(commit).toHaveBeenCalledTimes(3);
    await collapseAndRemount(String(Number(((1 - alpha()) * 100).toFixed(12))));
    expect(commit).toHaveBeenCalledTimes(3);
    // A genuine library thumb drag must still preview locally and commit once.
    paint.value = { kind: "value", value: { ...createPictureSolidPaint(), opacity: 0.8 } };
    await flushPromises();
    const slider = wrapper.get<HTMLElement>(".t-slider__rail");
    Object.defineProperty(slider.element, "clientWidth", { configurable: true, value: 100 });
    slider.element.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 100,
      bottom: 6,
      width: 100,
      height: 6,
      toJSON: () => ({}),
    });
    await wrapper
      .get(".t-slider__button-wrapper")
      .trigger("mousedown", { button: 0, clientX: 20, clientY: 0 });
    window.dispatchEvent(new MouseEvent("mousemove", { clientX: 30, clientY: 0, bubbles: true }));
    await flushPromises();
    expect(commit).toHaveBeenCalledTimes(3);
    window.dispatchEvent(new MouseEvent("mouseup", { clientX: 30, clientY: 0, bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 5));
    await flushPromises();
    expect(alpha()).toBe(0.7);
    expect(commit).toHaveBeenCalledTimes(4);
    const thumb = wrapper.get(".t-slider__button-wrapper");
    await thumb.trigger("keydown", { key: "ArrowRight", code: "ArrowRight" });
    await thumb.trigger("keydown", { key: "ArrowRight", code: "ArrowRight", repeat: true });
    await flushPromises();
    expect(commit).toHaveBeenCalledTimes(4);
    await thumb.trigger("keyup", { key: "ArrowRight", code: "ArrowRight" });
    await flushPromises();
    expect(alpha()).toBe(1 - 32 / 100);
    expect(commit).toHaveBeenCalledTimes(5);
    await thumb.trigger("keydown", { key: "ArrowRight", code: "ArrowRight" });
    await flushPromises();
    await thumb.trigger("keydown", { key: "Escape", code: "Escape" });
    await thumb.trigger("keyup", { key: "ArrowRight", code: "ArrowRight" });
    await flushPromises();
    expect(commit).toHaveBeenCalledTimes(5);
    expect(opacityInput(wrapper).element.value).toBe("32");
    await thumb.trigger("keydown", { key: "ArrowRight", code: "ArrowRight" });
    await flushPromises();
    owner.value = "replacement-owner";
    await flushPromises();
    await thumb.trigger("keyup", { key: "ArrowRight", code: "ArrowRight" });
    await flushPromises();
    expect(commit).toHaveBeenCalledTimes(5);
    expect(alpha()).toBe(1 - 32 / 100);
    await thumb.trigger("keydown", { key: "ArrowRight", code: "ArrowRight" });
    await flushPromises();
    visible.value = false;
    await nextTick();
    await thumb.trigger("keyup", { key: "ArrowRight", code: "ArrowRight" });
    await flushPromises();
    expect(commit).toHaveBeenCalledTimes(5);

    visible.value = true;
    await flushPromises();
    const boundaryThumb = wrapper.get<HTMLElement>(".t-slider__button-wrapper");
    boundaryThumb.element.focus();
    await boundaryThumb.trigger("keydown", { key: "ArrowRight", code: "ArrowRight" });
    await flushPromises();
    const outside = document.createElement("button");
    document.body.append(outside);
    outside.focus();
    await flushPromises();
    expect(commit).toHaveBeenCalledTimes(6);
    expect(alpha()).toBe(1 - 33 / 100);
    outside.dispatchEvent(
      new KeyboardEvent("keyup", { key: "ArrowRight", code: "ArrowRight", bubbles: true }),
    );
    await flushPromises();
    expect(commit).toHaveBeenCalledTimes(6);
    boundaryThumb.element.focus();
    await boundaryThumb.trigger("keydown", { key: "ArrowRight", code: "ArrowRight" });
    await flushPromises();
    window.dispatchEvent(new Event("blur"));
    await flushPromises();
    expect(commit).toHaveBeenCalledTimes(7);
    expect(alpha()).toBe(1 - 34 / 100);
    await boundaryThumb.trigger("keyup", { key: "ArrowRight", code: "ArrowRight" });
    expect(commit).toHaveBeenCalledTimes(7);
    // A down/up without drag has no library changeEnd; its temporary global listener must retire.
    const added = vi.spyOn(window, "addEventListener"),
      removed = vi.spyOn(window, "removeEventListener");
    try {
      await boundaryThumb.trigger("mousedown", { button: 0, clientX: 34, clientY: 0 });
      const pointerUp = added.mock.calls.filter(([type]) => type === "pointerup").at(-1)![1];
      window.dispatchEvent(new MouseEvent("mouseup", { clientX: 34, clientY: 0, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 20));
      await flushPromises();
      expect(commit).toHaveBeenCalledTimes(7);
      expect(
        removed.mock.calls.some(
          ([type, listener]) => type === "pointerup" && listener === pointerUp,
        ),
      ).toBe(true);
    } finally {
      added.mockRestore();
      removed.mockRestore();
    }
    reject.value = true;
    boundaryThumb.element.focus();
    await boundaryThumb.trigger("keydown", { key: "ArrowRight", code: "ArrowRight" });
    await flushPromises();
    outside.focus();
    await flushPromises();
    expect(commit).toHaveBeenCalledTimes(8);
    expect(alpha()).toBe(1 - 34 / 100);
    expect(opacityInput(wrapper).attributes("aria-invalid")).toBe("true");
    outside.dispatchEvent(
      new KeyboardEvent("keyup", { key: "ArrowRight", code: "ArrowRight", bubbles: true }),
    );
    await flushPromises();
    expect(commit).toHaveBeenCalledTimes(8);
    await opacityInput(wrapper).trigger("keydown", { key: "Escape", code: "Escape" });
    await flushPromises();
    expect(opacityInput(wrapper).element.value).toBe("34");
    // All existing inverse-opacity attributes use the same explicit display-only policy.
    const gradient = createPictureGradientPaint();
    gradient.stops[0]!.opacity = 0.8;
    const cases = [
      {
        component: PicturePaintEditor,
        props: {
          paintRole: "line",
          value: { kind: "value", value: { ...createPictureSolidPaint(), opacity: 0.8 } },
        },
        label: "paintOpacity",
      },
      { component: PictureGradientEditor, props: { value: gradient }, label: "paintOpacity" },
      {
        component: PictureShadowEditor,
        props: { value: { kind: "value", value: { ...createPictureShadow(), opacity: 0.8 } } },
        label: "shadowTransparencyPercent",
      },
      {
        component: PictureGlowEditor,
        props: { value: { kind: "value", value: { ...createPictureGlow(), opacity: 0.8 } } },
        label: "glowTransparencyPercent",
      },
      {
        component: PictureReflectionEditor,
        props: { value: { kind: "value", value: { ...createPictureReflection(), opacity: 0.8 } } },
        label: "reflectionTransparencyPercent",
      },
    ];
    for (const scenario of cases) {
      const apply = vi.fn(() => true);
      const w = mount(scenario.component, {
        attachTo: document.body,
        props: {
          ownerKey: "source",
          t: (key: string) => key,
          onCommit: apply,
          ...scenario.props,
        } as never,
        global: { plugins: [createAppI18n("en-US")] },
      });
      wrappers.push(w);
      const field = w
        .findAllComponents(PicturePaintNumber)
        .find((field) => field.props("label") === scenario.label)!;
      expect(field.props("displayPrecision")).toBe(12);
      expect(field.get<HTMLInputElement>("input").element.value).toBe("20");
      field.get<HTMLInputElement>("input").element.focus();
      field.get<HTMLInputElement>("input").element.blur();
      await flushPromises();
      expect(apply).not.toHaveBeenCalled();
    }
    const raw = 1.123456789012345;
    const w = mount(PicturePaintNumber, {
      props: {
        ownerKey: "unformatted",
        value: raw,
        label: "Width",
        unit: "pt",
        invalidMessage: "Invalid",
        rejectedMessage: "Rejected",
        onCommit: () => true,
      },
    });
    wrappers.push(w);
    expect(w.get<HTMLInputElement>("input").element.value).toBe(String(raw));
  } finally {
    wrappers.reverse().forEach((w) => w.unmount());
    document.body.replaceChildren();
  }
});
