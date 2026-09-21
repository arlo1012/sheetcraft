import { mount } from "@vue/test-utils";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { RadioGroup as TRadioGroup } from "tdesign-vue-next/es/radio";
import { Tabs as TTabs } from "tdesign-vue-next/es/tabs";
import { afterEach, describe, expect, test } from "vitest";
import { nextTick } from "vue";
import TextToColumnsDialog from "../../../../modules/data-tools/components/TextToColumnsDialog.vue";
import { createAppI18n } from "../../../../shared/i18n";

let wrapper: ReturnType<typeof mount> | undefined;
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  document.body.innerHTML = "";
});

const suggestion = {
  id: "comma",
  options: {
    mode: "delimiter" as const,
    delimiters: [","],
    textQualifier: '"' as const,
    mergeDelimiters: false,
  },
  confidence: 1,
  columnCount: 2,
};
function mountDialog(
  options: { suggestions?: readonly (typeof suggestion)[]; preview?: string[] } = {},
) {
  wrapper = mount(TextToColumnsDialog, {
    attachTo: document.body,
    props: {
      visible: true,
      destinationLabel: "A1",
      preview: options.preview ?? ["2026-09-21", "001"],
      suggestions: options.suggestions ?? [suggestion],
      sourceRows: [{ row: 0, text: "2026-09-21,001" }],
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  return wrapper;
}
async function next(dialog: ReturnType<typeof mount>) {
  await dialog.get("[data-split-next]").trigger("click");
  await nextTick();
}

describe("TextToColumnsDialog", () => {
  test("starts in automatic split, selects the first recommendation, and blocks an empty recommendation set", async () => {
    const automatic = mountDialog();
    await nextTick();
    expect(automatic.text()).toContain("Delimited (Comma): about 2 columns");
    expect(automatic.get("[data-split-next]").attributes("disabled")).toBeUndefined();
    automatic.unmount();
    const empty = mountDialog({ suggestions: [] });
    expect(empty.text()).toContain("No reliable split rule was detected");
    expect(empty.get("[data-split-next]").attributes("disabled")).toBeDefined();
  });

  test("switches to custom split and exposes all four basic rules", async () => {
    const dialog = mountDialog();
    dialog.getComponent(TTabs).vm.$emit("change", "custom");
    await nextTick();
    expect(dialog.text()).toContain("Delimited");
    expect(dialog.text()).toContain("Text type");
    expect(dialog.text()).toContain("Keyword");
    expect(dialog.text()).toContain("Fixed width");
  });

  test("configures keyword, text-type, and fixed-width custom rules", async () => {
    const dialog = mountDialog();
    dialog.getComponent(TTabs).vm.$emit("change", "custom");
    await nextTick();
    const modes = dialog
      .findAllComponents(TRadioGroup)
      .find((group) => group.classes().includes("text-to-columns-dialog__mode-tabs"))!;
    modes.vm.$emit("change", "keyword");
    await nextTick();
    expect(dialog.text()).toContain("Keep keywords");
    modes.vm.$emit("change", "text-type");
    await nextTick();
    expect(dialog.text()).toContain("Chinese");
    expect(dialog.text()).toContain("English");
    expect(dialog.text()).toContain("Numbers");
    modes.vm.$emit("change", "fixed-width");
    await nextTick();
    expect(dialog.text()).toContain("Create");
  });

  test("formats an output column as a date, preserves it after back, and applies only on Finish", async () => {
    const dialog = mountDialog();
    await next(dialog);
    const select = dialog.getComponent(TRadioGroup);
    select.vm.$emit("change", "date");
    await nextTick();
    expect(dialog.getComponent(TSelect).props("value")).toBe("YMD");
    await dialog.get("[data-split-previous]").trigger("click");
    await next(dialog);
    expect(dialog.getComponent(TRadioGroup).props("value")).toBe("date");
    expect(dialog.emitted("apply")).toBeUndefined();
    await next(dialog);
    expect(dialog.emitted("apply")?.at(-1)?.[0]).toMatchObject({
      mode: "auto",
      autoSuggestionId: "comma",
      columnTypes: ["date", "general"],
    });
  });

  test("keeps result-column state when the preview changes", async () => {
    const dialog = mountDialog();
    await next(dialog);
    dialog.getComponent(TRadioGroup).vm.$emit("change", "text");
    await nextTick();
    await dialog.setProps({ preview: ["001", "North", "West"] });
    await nextTick();
    expect(dialog.getComponent(TRadioGroup).props("value")).toBe("text");
    await dialog.get('[data-split-column="2"]').trigger("click");
    dialog.getComponent(TRadioGroup).vm.$emit("change", "skip");
    await nextTick();
    expect(dialog.text()).toContain("Do not import");
  });
});
