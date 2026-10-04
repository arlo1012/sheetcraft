import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import { Dialog } from "tdesign-vue-next/es/dialog";
import NoteEditorDialog from "../../../modules/review-tools/components/NoteEditorDialog.vue";
import ReviewToolbar from "../../../modules/review-tools/components/ReviewToolbar.vue";
import { createAppI18n } from "../../../shared/i18n";

let wrapper: ReturnType<typeof mount> | undefined;

afterEach(() => {
  wrapper?.unmount();
  document.body.replaceChildren();
});

describe("review note components", () => {
  test("keeps multiline note whitespace and does not save from Enter in the editor", async () => {
    wrapper = mount(NoteEditorDialog, {
      attachTo: document.body,
      props: {
        visible: true,
        address: "B2",
        text: "",
        author: "Alice",
      },
      global: { plugins: [createAppI18n("en-US")] },
    });
    const textArea = wrapper.find<HTMLTextAreaElement>("textarea");
    await textArea.setValue("  first line\nsecond line  ");
    await textArea.trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("save")).toBeUndefined();
    expect(wrapper.findComponent(Dialog).props("confirmOnEnter")).toBe(false);

    wrapper.findComponent(Dialog).vm.$emit("confirm");
    expect(wrapper.emitted("save")?.[0]).toEqual([
      { text: "  first line\nsecond line  ", author: "Alice" },
    ]);
  });

  test("offers current-note visibility without a notes-list action, including on locked sheets", async () => {
    wrapper = mount(ReviewToolbar, {
      props: { busy: false, readOnly: true, hasNote: true, hasNotes: true, showActiveNote: true },
      global: { plugins: [createAppI18n("en-US")] },
    });
    const toggle = wrapper.get('[data-review-action="toggle-note"]');
    expect(toggle.attributes("disabled")).toBeUndefined();
    expect(toggle.attributes("aria-label")).toBe("Hide Note");
    await toggle.trigger("click");
    expect(wrapper.emitted("toggleNote")).toEqual([[]]);
    expect(wrapper.find('[data-review-action="toggle-notes"]').exists()).toBe(false);
    await wrapper.setProps({ hasNote: false });
    expect(toggle.attributes("disabled")).toBeDefined();
  });
});
