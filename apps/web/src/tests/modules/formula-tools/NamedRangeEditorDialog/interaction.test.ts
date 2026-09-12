import { mount } from "@vue/test-utils";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { afterEach, expect, test } from "vitest";
import { createAppI18n } from "../../../../shared/i18n";
import NamedRangeEditorDialog from "../../../../modules/formula-tools/components/NamedRangeEditorDialog.vue";

const mounted: Array<{ unmount(): void }> = [];

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  document.body.innerHTML = "";
});

function mountEditor(initialDraft: {
  id?: string;
  name: string;
  scopeSheetId?: string;
  reference: string;
}) {
  const wrapper = mount(NamedRangeEditorDialog, {
    attachTo: document.body,
    global: { plugins: [createAppI18n("en-US")] },
    props: {
      initialDraft,
      sheets: [{ id: "budget", name: "Budget" }],
      selectionReference: "=Budget!$A$1:$B$4",
    },
  });
  mounted.push(wrapper);
  return wrapper;
}

test("uses the captured selection for a new named range", async () => {
  const wrapper = mountEditor({ name: "", reference: "" });

  const reference = wrapper.get<HTMLInputElement>("[data-formula-reference] input");
  expect(reference.element.value).toBe("=Budget!$A$1:$B$4");
  await wrapper.get(".named-range-editor-dialog__selection").trigger("click");

  expect(wrapper.emitted("createFromSelection")).toHaveLength(1);
  expect(reference.element.value).toBe("=Budget!$A$1:$B$4");
});

test("does not replace an existing range reference with the selection", async () => {
  const wrapper = mountEditor({
    id: "revenue",
    name: "Revenue",
    scopeSheetId: "budget",
    reference: "=Budget!$C$1",
  });

  const reference = wrapper.get<HTMLInputElement>("[data-formula-reference] input");
  expect(reference.element.value).toBe("=Budget!$C$1");
  await wrapper.setProps({ selectionReference: "=Budget!$D$1" });

  expect(reference.element.value).toBe("=Budget!$C$1");
  expect(wrapper.getComponent(TSelect).props("disabled")).toBe(true);
});
