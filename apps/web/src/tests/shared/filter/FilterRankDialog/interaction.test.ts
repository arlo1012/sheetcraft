import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { InputNumber as TInputNumber } from "tdesign-vue-next/es/input-number";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import FilterRankDialog from "../../../../shared/filter/components/FilterRankDialog.vue";
import { createAppI18n } from "../../../../shared/i18n";

let wrapper: ReturnType<typeof mount> | undefined;

afterEach(() => {
  wrapper?.unmount();
  document.body.replaceChildren();
});

function fixture(initial?: { bottom: boolean; percent: boolean; count: number }) {
  wrapper = mount(FilterRankDialog, {
    attachTo: document.body,
    props: { visible: true, initial: initial ? { kind: "rank", ...initial } : undefined },
    global: { plugins: [createAppI18n("en-US")] },
  });
  return wrapper;
}

describe("FilterRankDialog", () => {
  test("accepts a 12.5 percent rank draft", async () => {
    const w = fixture();
    w.findAllComponents(TSelect)[1]!.vm.$emit("update:modelValue", "percent");
    w.findComponent(TInputNumber).vm.$emit("update:modelValue", 12.5);
    await w.vm.$nextTick();
    expect(w.findComponent(Dialog).props("confirmBtn")).toMatchObject({ disabled: false });
    w.findComponent(Dialog).vm.$emit("confirm");
    expect(w.emitted("apply")).toEqual([
      [{ kind: "rank", bottom: false, percent: true, count: 12.5 }],
    ]);
  });

  test("allows up to 500 items and rejects a 501-item rank", async () => {
    const w = fixture();
    const input = w.findComponent(TInputNumber);
    input.vm.$emit("update:modelValue", 500);
    await w.vm.$nextTick();
    expect(w.findComponent(Dialog).props("confirmBtn")).toMatchObject({ disabled: false });
    input.vm.$emit("update:modelValue", 501);
    await w.vm.$nextTick();
    expect(w.findComponent(Dialog).props("confirmBtn")).toMatchObject({ disabled: true });
  });
});
