import { mount, flushPromises } from "@vue/test-utils";
import { defineComponent, h, ref, withDirectives } from "vue";
import { expect, test } from "vitest";
import { Slider } from "tdesign-vue-next/es/slider";
import { vSliderSemantics } from "../../../shared/tdesign/slider-semantics";
import PicturePaintNumber from "../../../modules/sheet-images/components/format-pane/PicturePaintNumber.vue";

test("picture percentage exposes 70 percent on the real slider role and tracks updates without edits", async () => {
  let commits = 0;
  const wrapper = mount(PicturePaintNumber, {
    props: {
      ownerKey: "picture-a",
      value: 70,
      label: "Transparency",
      unit: "%",
      min: 0,
      max: 100,
      invalidMessage: "Invalid",
      rejectedMessage: "Rejected",
      onCommit: () => {
        commits++;
        return true;
      },
    },
  });
  try {
    await flushPromises();
    expect(wrapper.get('[role="slider"]').attributes()).toMatchObject({
      "aria-label": "Transparency",
      "aria-valuenow": "70",
      "aria-valuetext": "70 %",
      "aria-valuemin": "0",
      "aria-valuemax": "100",
      "aria-disabled": "false",
    });
    await wrapper.setProps({ value: 30, disabled: true });
    await flushPromises();
    expect(wrapper.get('[role="slider"]').attributes()).toMatchObject({
      "aria-valuenow": "30",
      "aria-valuetext": "30 %",
      "aria-disabled": "true",
    });
    expect(commits).toBe(0);
  } finally {
    wrapper.unmount();
  }
});

test("slider adapter rebinds rebuilt roots, removes unavailable semantics and releases only owned attrs", async () => {
  const key = ref(0),
    value = ref<number | undefined>(70);
  const wrapper = mount(
    defineComponent({
      setup: () => () =>
        withDirectives(h(Slider, { key: key.value, modelValue: value.value, min: 0, max: 100 }), [
          [vSliderSemantics, { label: "Opacity", value: value.value, min: 0, max: 100, unit: "%" }],
        ]),
    }),
  );
  try {
    await flushPromises();
    const old = wrapper.get('[role="slider"]').element;
    expect(old.getAttribute("aria-valuenow")).toBe("70");
    key.value++;
    value.value = 80;
    await flushPromises();
    const current = wrapper.get('[role="slider"]').element;
    expect(current).not.toBe(old);
    expect(old.hasAttribute("aria-valuenow")).toBe(false);
    expect(current.getAttribute("aria-valuenow")).toBe("80");
    for (const unavailable of [undefined, NaN, Infinity, -1, 101]) {
      value.value = unavailable;
      await flushPromises();
      expect(current.hasAttribute("aria-valuenow")).toBe(false);
      expect(current.hasAttribute("aria-valuetext")).toBe(false);
      expect(current.getAttribute("aria-label")).toBe("Opacity");
    }
    value.value = 40;
    await flushPromises();
    current.setAttribute("aria-label", "New owner label");
    wrapper.unmount();
    expect(current.getAttribute("aria-label")).toBe("New owner label");
    expect(current.hasAttribute("aria-valuenow")).toBe(false);
    expect(current.getAttribute("aria-valuemin")).toBe("0");
  } finally {
    if (wrapper.exists()) wrapper.unmount();
  }
});
