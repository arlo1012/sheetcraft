import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { expect, test, vi } from "vitest";
import NumericField from "../../../shared/numeric-field/NumericField.vue";
import { createShapeTextFieldDrafts } from "../../../modules/sheet-drawings/shape-text-field-drafts";

test("clean numeric composition blocks an outer session flush until composition ends without a document edit", async () => {
  const commit = vi.fn(() => ({ accepted: true as const }));
  const wrapper = mount(NumericField, {
    attachTo: document.body,
    props: {
      value: { kind: "value", value: 11 },
      ownerKey: "object-a",
      spec: { displayUnit: "pt", displayStep: 1 },
      label: "Inset",
      invalidMessage: "Invalid",
      rejectedMessage: "Rejected",
      onCommit: commit,
    },
  });
  const registry = createShapeTextFieldDrafts();
  const unregister = registry.register({
    owner: "session-a",
    current: () => true,
    flush: () => wrapper.vm.commit("external"),
    focus: () => wrapper.vm.focus(),
    blocking: () => wrapper.vm.hasPending(),
  });
  try {
    const input = wrapper.get<HTMLInputElement>("input");
    input.element.focus();
    await input.trigger("compositionstart");
    // No input event and no dirty text: composition alone must block the outer write.
    expect(wrapper.vm.hasPending()).toBe(true);
    expect(registry.flush("session-a")).toEqual({ accepted: false });
    expect(document.activeElement).toBe(input.element);
    expect(commit).not.toHaveBeenCalled();
    await input.trigger("compositionend");
    await nextTick();
    expect(registry.flush("session-a")).toEqual({ accepted: true });
    expect(wrapper.vm.hasPending()).toBe(false);
    expect(input.element.value).toBe("11");
    expect(commit).not.toHaveBeenCalled();
  } finally {
    unregister();
    wrapper.unmount();
    document.body.replaceChildren();
  }
});
