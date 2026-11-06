// 未执行：按用户要求仅编写测试，避免额外内存占用。
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, test } from "vitest";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Button } from "tdesign-vue-next/es/button";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import AttachmentInsertDialog from "../../../modules/attachments/components/AttachmentInsertDialog.vue";
import { createAppI18n } from "../../../shared/i18n";

const mountedWrappers: Array<{ unmount(): void }> = [];
afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
});

function fixture(display: "icon" | "document" = "document", fileName?: string) {
  const wrapper = mount(AttachmentInsertDialog, {
    attachTo: document.body,
    props: { display, fileName, busy: false, error: false },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mountedWrappers.push(wrapper);
  return wrapper;
}

function browse(wrapper: ReturnType<typeof fixture>) {
  const button = wrapper
    .findAllComponents(Button)
    .find((candidate) => candidate.text() === "Browse…");
  expect(button).toBeDefined();
  return button!;
}

describe("attachment insertion dialog", () => {
  test("waits for an explicit browse action and disables confirmation without a file", async () => {
    const wrapper = fixture();
    expect(document.body.textContent).toContain("No file selected");
    expect(wrapper.getComponent(Dialog).props("confirmBtn")).toMatchObject({ disabled: true });
    expect(wrapper.emitted("chooseFile")).toBeUndefined();
    expect(wrapper.emitted("confirm")).toBeUndefined();

    await browse(wrapper).trigger("click");
    expect(wrapper.emitted("chooseFile")).toEqual([[]]);
    expect(wrapper.emitted("confirm")).toBeUndefined();

    await wrapper.setProps({ fileName: "report.txt" });
    expect(document.body.textContent).toContain("report.txt");
    expect(wrapper.getComponent(Dialog).props("confirmBtn")).toMatchObject({ disabled: false });
  });

  test.each(["icon", "document"] as const)("initializes and confirms %s display", (display) => {
    const wrapper = fixture(display, "report.txt");
    expect(wrapper.getComponent(Checkbox).props("modelValue")).toBe(display === "icon");
    wrapper.getComponent(Dialog).vm.$emit("confirm");
    expect(wrapper.emitted("confirm")).toEqual([[display]]);
    expect(wrapper.emitted("chooseFile")).toBeUndefined();
  });

  test("switches between icon and document display through its checkbox", async () => {
    const wrapper = fixture("document", "report.txt");
    const checkbox = wrapper.getComponent(Checkbox);
    checkbox.vm.$emit("update:modelValue", true);
    await nextTick();
    wrapper.getComponent(Dialog).vm.$emit("confirm");
    expect(wrapper.emitted("confirm")).toEqual([["icon"]]);

    checkbox.vm.$emit("update:modelValue", false);
    await nextTick();
    wrapper.getComponent(Dialog).vm.$emit("confirm");
    expect(wrapper.emitted("confirm")).toEqual([["icon"], ["document"]]);
  });

  test("disables browsing, mode changes and confirmation while the file is being prepared", async () => {
    const wrapper = fixture("document", "report.txt");
    await wrapper.setProps({ busy: true });
    expect(browse(wrapper).props("disabled")).toBe(true);
    expect(wrapper.getComponent(Checkbox).props("disabled")).toBe(true);
    expect(wrapper.getComponent(Dialog).props("confirmBtn")).toMatchObject({
      disabled: true,
      loading: true,
    });
    expect(wrapper.emitted("confirm")).toBeUndefined();
  });

  test("shows a preparation error with the file and chosen mode available for retry", async () => {
    const wrapper = fixture("icon", "report.txt");
    await wrapper.setProps({ error: true });
    expect(document.body.querySelector('[role="alert"]')?.textContent).toContain(
      "Could not insert file",
    );
    expect(document.body.textContent).toContain("report.txt");
    expect(wrapper.getComponent(Checkbox).props("modelValue")).toBe(true);
    expect(wrapper.getComponent(Dialog).props("confirmBtn")).toMatchObject({ disabled: false });
    wrapper.getComponent(Dialog).vm.$emit("confirm");
    expect(wrapper.emitted("confirm")).toEqual([["icon"]]);
  });

  test("closes without requesting a file or confirming an insertion", () => {
    const wrapper = fixture("document", "report.txt");
    wrapper.getComponent(Dialog).vm.$emit("close");
    expect(wrapper.emitted("close")).toEqual([[]]);
    expect(wrapper.emitted("chooseFile")).toBeUndefined();
    expect(wrapper.emitted("confirm")).toBeUndefined();
  });
});
