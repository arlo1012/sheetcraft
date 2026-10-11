import { afterEach, expect, test } from "vitest";
import { mount } from "@vue/test-utils";
import { Dialog } from "tdesign-vue-next/es/dialog";
import PictureBatchSizeDialog from "../../../../modules/sheet-images/components/PictureBatchSizeDialog.vue";
import PictureCompressDialog from "../../../../modules/sheet-images/components/PictureCompressDialog.vue";
import { createAppI18n } from "../../../../shared/i18n";
const mounted: Array<{ unmount(): void }> = [];
afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.replaceChildren();
});
test("batch-size rejection shows an alert without resetting edited width", async () => {
  const wrapper = mount(PictureBatchSizeDialog, {
    attachTo: document.body,
    props: { width: 200, height: 100 },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  const input = document.querySelector(".picture-batch-size input") as HTMLInputElement;
  input.value = "300";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await wrapper.setProps({ error: "Size could not be applied" });
  expect(document.querySelector('[role="alert"]')?.textContent).toBe("Size could not be applied");
  expect((document.querySelector(".picture-batch-size input") as HTMLInputElement).value).toBe(
    "300",
  );
});
test("busy compression keeps cancellation available and displays a retained failure", async () => {
  const wrapper = mount(PictureCompressDialog, {
    attachTo: document.body,
    props: { busy: true, error: "Compression rejected" },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  const dialog = wrapper.findComponent(Dialog);
  expect(dialog.props("closeBtn")).toBe(true);
  expect(dialog.props("cancelBtn")).toBe("Cancel");
  expect(document.querySelector('[role="alert"]')?.textContent).toBe("Compression rejected");
  dialog.vm.$emit("close");
  expect(wrapper.emitted("close")).toHaveLength(1);
});
