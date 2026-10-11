import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Input } from "tdesign-vue-next/es/input";
import SymbolDialog from "../../../modules/insert-tools/components/SymbolDialog.vue";
import { createAppI18n } from "../../../shared/i18n";

const mounted: Array<{ unmount(): void }> = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
});
function fixture(disabled = false) {
  const wrapper = mount(SymbolDialog, {
    attachTo: document.body,
    props: { disabled },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  return wrapper;
}
describe("existing Symbol dialog", () => {
  test("selects a preset and confirms its exact text", async () => {
    const wrapper = fixture();
    await wrapper.get(".symbol-dialog__grid button:nth-child(1)").trigger("click");
    expect(wrapper.get(".symbol-dialog__grid button:nth-child(1)").attributes("aria-pressed")).toBe(
      "true",
    );
    wrapper.getComponent(Dialog).vm.$emit("confirm");
    expect(wrapper.emitted("insert")).toEqual([["✓"]]);
  });
  test("double-click confirms a selected preset once", async () => {
    const wrapper = fixture();
    await wrapper.get(".symbol-dialog__grid button:nth-child(5)").trigger("dblclick");
    expect(wrapper.emitted("insert")).toEqual([["★"]]);
  });
  test("custom text is literal and cancel does not insert it", async () => {
    const wrapper = fixture();
    await wrapper.getComponent(Input).vm.$emit("update:modelValue", "Ω🙂<>&");
    expect(wrapper.getComponent(Input).props("maxlength")).toBe(16);
    wrapper.getComponent(Dialog).vm.$emit("confirm");
    expect(wrapper.emitted("insert")).toEqual([["Ω🙂<>&"]]);
    const canceled = fixture();
    await canceled.getComponent(Input).vm.$emit("update:modelValue", "Canceled custom");
    canceled.getComponent(Dialog).vm.$emit("close");
    expect(canceled.emitted("close")).toEqual([[]]);
    expect(canceled.emitted("insert")).toBeUndefined();
  });
  test("empty or disabled confirmation produces no insert", async () => {
    const wrapper = fixture();
    await wrapper.getComponent(Input).vm.$emit("update:modelValue", "");
    wrapper.getComponent(Dialog).vm.$emit("confirm");
    expect(wrapper.emitted("insert")).toBeUndefined();
    await wrapper.setProps({ disabled: true });
    await wrapper.get(".symbol-dialog__grid button:nth-child(1)").trigger("dblclick");
    wrapper.getComponent(Dialog).vm.$emit("confirm");
    expect(wrapper.emitted("insert")).toBeUndefined();
  });
});
