import { mount } from "@vue/test-utils";
import { afterEach, expect, test } from "vitest";
import { createAppI18n } from "../../../../shared/i18n";
import NamedRangesDialog from "../../../../modules/formula-tools/components/NamedRangesDialog.vue";

const mounted: Array<{ unmount(): void }> = [];

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  document.body.innerHTML = "";
});

test("uses the shared option list to select and display named ranges", async () => {
  const wrapper = mount(NamedRangesDialog, {
    attachTo: document.body,
    global: { plugins: [createAppI18n("en-US")] },
    props: {
      visible: true,
      ranges: [
        { id: "revenue", name: "Revenue", reference: "Budget!A1:A5" },
        { id: "costs", name: "Costs", reference: "Budget!B1:B5" },
      ],
      sheets: [{ id: "budget", name: "Budget" }],
    },
  });
  mounted.push(wrapper);

  const list = wrapper.find<HTMLElement>("[aria-label='Name manager'][role='listbox']");
  expect(list.exists()).toBe(true);
  expect(list.text()).toContain("Revenue");
  expect(list.text()).toContain("Budget!A1:A5");

  document.querySelector<HTMLButtonElement>("[data-named-range='costs']")?.click();
  await wrapper.vm.$nextTick();

  expect((wrapper.get("[data-formula-name] input").element as HTMLInputElement).value).toBe(
    "Costs",
  );
  expect((wrapper.get("[data-formula-reference] input").element as HTMLInputElement).value).toBe(
    "Budget!B1:B5",
  );
});
