import { mount } from "@vue/test-utils";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { RadioGroup as TRadioGroup } from "tdesign-vue-next/es/radio";
import { afterEach, describe, expect, test } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";
import TextToColumnsDialog from "../../../../modules/data-tools/components/TextToColumnsDialog.vue";
import FixedWidthSplitEditor from "../../../../modules/data-tools/components/FixedWidthSplitEditor.vue";
import { createAppI18n } from "../../../../shared/i18n";
let wrapper: ReturnType<typeof mount> | undefined;
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  document.body.innerHTML = "";
});
function mountDialog(preview = ["001", "North"]) {
  wrapper = mount(TextToColumnsDialog, {
    attachTo: document.body,
    props: {
      visible: true,
      preview,
      destinationLabel: "A1",
      sourceRows: [
        { row: 0, text: "001,North" },
        { row: 1, text: "002,South" },
      ],
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  return wrapper;
}
async function next(dialog: Pick<ReturnType<typeof mount>, "get">) {
  await dialog.get("[data-split-next]").trigger("click");
}
describe("TextToColumnsDialog wizard", () => {
  test("previews multiple source rows, advances without writing, and applies selected column types only on Finish", async () => {
    const dialog = mountDialog();
    expect(dialog.text()).toContain("002,South");
    await next(dialog);
    await next(dialog);
    expect(dialog.emitted("apply")).toBeUndefined();
    dialog.getComponent(TSelect).vm.$emit("change", "text");
    await nextTick();
    await dialog.get('[data-split-column="1"]').trigger("click");
    dialog.getComponent(TSelect).vm.$emit("change", "skip");
    await nextTick();
    await next(dialog);
    expect(dialog.emitted("apply")?.at(-1)?.[0]).toMatchObject({
      columnTypes: ["text", "skip"],
      destination: "A1",
      textQualifier: '"',
      mergeDelimiters: false,
    });
  });
  test("retains formats through preview changes, previous steps and a suspended range picker", async () => {
    const dialog = mountDialog(["001"]);
    await next(dialog);
    await next(dialog);
    dialog.getComponent(TSelect).vm.$emit("change", "text");
    await nextTick();
    await dialog.setProps({ picking: true, preview: [] });
    await dialog.setProps({ picking: false, preview: ["001", "North", "2026"] });
    expect(dialog.getComponent(TSelect).props("value")).toBe("text");
    await dialog.get("[data-split-previous]").trigger("click");
    await next(dialog);
    await next(dialog);
    expect(dialog.emitted("apply")?.at(-1)?.[0]).toMatchObject({
      columnTypes: ["text", "general", "general"],
    });
    await dialog.setProps({ visible: false });
    await dialog.setProps({ visible: true });
    await next(dialog);
    await next(dialog);
    expect(dialog.getComponent(TSelect).props("value")).toBe("general");
  });
  test("requires fixed-width breaks before advancing and blocks all skipped output", async () => {
    const dialog = mountDialog();
    dialog.getComponent(TRadioGroup).vm.$emit("update:modelValue", "fixed-width");
    await nextTick();
    await next(dialog);
    expect(dialog.get("[data-split-next]").attributes("disabled")).toBeDefined();
    dialog.getComponent(FixedWidthSplitEditor).vm.$emit("change", [3]);
    await nextTick();
    await next(dialog);
    dialog.getComponent(TSelect).vm.$emit("change", "skip");
    await nextTick();
    await dialog.get('[data-split-column="1"]').trigger("click");
    dialog.getComponent(TSelect).vm.$emit("change", "skip");
    await nextTick();
    expect(dialog.get("[data-split-next]").attributes("disabled")).toBeDefined();
    dialog.getComponent(Dialog).vm.$emit("confirm");
    expect(dialog.emitted("apply")).toBeUndefined();
  });
  test("offers formats for columns that occur beyond the preview sample", async () => {
    const dialog = mountDialog(["001", "North"]);
    await dialog.setProps({ totalColumnCount: 3 });
    await next(dialog);
    await next(dialog);
    await dialog.get('[data-split-column="2"]').trigger("click");
    dialog.getComponent(TSelect).vm.$emit("change", "text");
    await nextTick();
    await next(dialog);
    expect(dialog.emitted("apply")?.at(-1)?.[0]).toMatchObject({
      columnTypes: ["general", "general", "text"],
    });
  });
  test("does not loop when a parent computes a fresh preview for each draft", async () => {
    const preview = ref(["001", "North"]);
    const count = ref(0);
    wrapper = mount(
      defineComponent({
        setup: () => () =>
          h(TextToColumnsDialog, {
            visible: true,
            destinationLabel: "A1",
            preview: [...preview.value],
            onDraftChange: () => {
              count.value += 1;
              preview.value = [...preview.value];
            },
          }),
      }),
      { attachTo: document.body, global: { plugins: [createAppI18n("en-US")] } },
    );
    await nextTick();
    const dialog = wrapper.getComponent(TextToColumnsDialog);
    await next(dialog);
    await next(dialog);
    const before = count.value;
    dialog.getComponent(TSelect).vm.$emit("change", "text");
    await nextTick();
    await nextTick();
    expect(count.value).toBe(before + 1);
  });
});
