import { mount } from "@vue/test-utils";
import { afterEach, expect, test } from "vitest";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import LookupFillDialog from "../../../../../modules/data-tools/components/LookupFillDialog.vue";
import { createAppI18n } from "../../../../../shared/i18n";

let wrapper: ReturnType<typeof mount> | undefined;
afterEach(() => {
  wrapper?.unmount();
  document.body.replaceChildren();
});

test("edits field mappings without mutating its initial draft and publishes preview updates", async () => {
  const initial = {
    sourceRange: "Sheet1!A1:C3",
    targetRange: "Sheet1!D1:F3",
    hasHeader: true,
    matchFields: [{ sourceColumn: 0, targetColumn: 0 }],
    fillFields: [{ sourceColumn: 1, targetColumn: 1 }],
    matchMode: "first" as const,
    overwrite: false,
  };
  const columns = [0, 1, 2].map((column) => ({ column, label: String(column + 1) }));
  wrapper = mount(LookupFillDialog, {
    attachTo: document.body,
    props: { visible: true, initial, sourceColumns: columns, targetColumns: columns },
    global: { plugins: [createAppI18n("en-US")] },
  });
  wrapper.findAllComponents(TSelect)[2]!.vm.$emit("update:modelValue", 2);
  await wrapper.vm.$nextTick();
  expect(initial.fillFields[0]!.sourceColumn).toBe(1);
  const next = wrapper.emitted("draftChange")?.at(-1)?.[0];
  expect(next).toMatchObject({ fillFields: [{ sourceColumn: 2, targetColumn: 1 }] });
  await wrapper.setProps({ initial: next });
  const eventCount = wrapper.emitted("draftChange")!.length;
  await wrapper.vm.$nextTick();
  expect(wrapper.emitted("draftChange")).toHaveLength(eventCount);
});
