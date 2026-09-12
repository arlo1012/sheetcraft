import { flushPromises, mount } from "@vue/test-utils";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { afterEach, expect, test } from "vitest";
import { createAppI18n } from "../../../../shared/i18n";
import NamedRangeEditorDialog from "../../../../modules/formula-tools/components/NamedRangeEditorDialog.vue";

const mounted: Array<{ unmount(): void }> = [];

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  document.body.innerHTML = "";
});

function mountEditor(
  initialDraft: {
    id?: string;
    name: string;
    scopeSheetId?: string;
    reference: string;
  },
  selectReference?: (current: string) => Promise<string | undefined>,
) {
  const wrapper = mount(NamedRangeEditorDialog, {
    attachTo: document.body,
    global: { plugins: [createAppI18n("en-US")] },
    props: {
      initialDraft,
      sheets: [{ id: "budget", name: "Budget" }],
      selectionReference: "=Budget!$A$1:$B$4",
      selectReference,
    },
  });
  mounted.push(wrapper);
  return wrapper;
}

test("uses the selected reference for a new named range", async () => {
  const selectReference = async (current: string) => {
    expect(current).toBe("=Budget!$A$1:$B$4");
    return "=Budget!$C$1:$D$4";
  };
  const wrapper = mountEditor({ name: "", reference: "" }, selectReference);

  const reference = wrapper.get<HTMLInputElement>("[data-formula-reference] input");
  expect(reference.element.value).toBe("=Budget!$A$1:$B$4");
  await wrapper.get("[data-select-formula-reference]").trigger("click");
  await flushPromises();

  expect(reference.element.value).toBe("=Budget!$C$1:$D$4");
});

test("updates an existing range reference from the selected range", async () => {
  const wrapper = mountEditor(
    {
      id: "revenue",
      name: "Revenue",
      scopeSheetId: "budget",
      reference: "=Budget!$C$1",
    },
    async (current) => {
      expect(current).toBe("=Budget!$C$1");
      return "=Budget!$D$1";
    },
  );

  const reference = wrapper.get<HTMLInputElement>("[data-formula-reference] input");
  expect(reference.element.value).toBe("=Budget!$C$1");
  await wrapper.get("[data-select-formula-reference]").trigger("click");
  await flushPromises();

  expect(reference.element.value).toBe("=Budget!$D$1");
  expect(wrapper.getComponent(TSelect).props("disabled")).toBe(true);
});

test("keeps the current reference when selection is cancelled", async () => {
  const wrapper = mountEditor(
    { name: "Revenue", reference: "=Budget!$C$1" },
    async () => undefined,
  );

  const reference = wrapper.get<HTMLInputElement>("[data-formula-reference] input");
  await wrapper.get("[data-select-formula-reference]").trigger("click");
  await flushPromises();

  expect(reference.element.value).toBe("=Budget!$C$1");
});

test("saves an edited multiline comment with the name draft", async () => {
  const wrapper = mountEditor({ name: "Revenue", reference: "=Budget!$C$1" });
  await wrapper.get("textarea").setValue("Forecast\nReviewed");
  await wrapper.get("form").trigger("submit");
  await flushPromises();
  expect(wrapper.emitted("save")?.[0]?.[0]).toMatchObject({
    name: "Revenue",
    reference: "=Budget!$C$1",
    comment: "Forecast\nReviewed",
  });
});
