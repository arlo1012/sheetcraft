import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import { Dialog } from "tdesign-vue-next/es/dialog";
import NoteEditorDialog from "../../../modules/review-tools/components/NoteEditorDialog.vue";
import NoteListPanel from "../../../modules/review-tools/components/NoteListPanel.vue";
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

  test("navigates from the list and hides edit actions while it is read-only", async () => {
    wrapper = mount(NoteListPanel, {
      props: {
        activeAddress: "B2",
        readOnly: true,
        notes: [
          { address: "B2", row: 1, column: 1, text: "Check total", author: "Alice" },
          { address: "C3", row: 2, column: 2, text: "Confirm date" },
        ],
      },
      global: { plugins: [createAppI18n("en-US")] },
    });
    await wrapper.findAll(".note-list-panel__navigate")[1]!.trigger("click");
    expect(wrapper.emitted("navigate")).toEqual([[{ row: 2, column: 2 }]]);
    expect(wrapper.find(".note-list-panel__actions").exists()).toBe(false);
    expect(wrapper.find('[aria-current="true"]').text()).toContain("B2");
  });
});
