import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import { Dialog } from "tdesign-vue-next/es/dialog";
import DataTableDialog from "../../../../../modules/data-tools/components/DataTableDialog.vue";
import RangeReferenceInput from "../../../../../shared/range-reference/RangeReferenceInput.vue";
import { createAppI18n } from "../../../../../shared/i18n";

const mounted: Array<{ unmount(): void }> = [];

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
});

const initial = () => ({ range: "=Sheet1!$A$1:$C$3", rowInput: "", columnInput: "" });

function dialog(props: Partial<InstanceType<typeof DataTableDialog>["$props"]> = {}) {
  const wrapper = mount(DataTableDialog, {
    attachTo: document.body,
    props: { visible: true, initial: initial(), ...props },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  return wrapper;
}

describe("DataTableDialog", () => {
  test("uses range selection for the table and single-cell selection for inputs", async () => {
    const selectReference = vi.fn(async (_current: string, options?: { singleCell?: boolean }) =>
      options?.singleCell ? "=Sheet1!$D$1" : "=Sheet1!$A$1:$C$3",
    );
    const wrapper = dialog({ selectReference });
    const pickers = wrapper.findAll("[data-select-formula-reference]");
    expect(pickers).toHaveLength(3);
    for (const picker of pickers) await picker.trigger("click");
    await flushPromises();

    expect(selectReference.mock.calls.map(([, options]) => options)).toEqual([
      { singleCell: false },
      { singleCell: true },
      { singleCell: true },
    ]);
  });

  test("applies a successful preview and retains the user draft while the picker suspends the dialog", async () => {
    const wrapper = dialog({
      result: {
        rows: 2,
        columns: 2,
        values: [
          [2, 4],
          [3, 6],
        ],
      },
    });
    const inputs = wrapper.findAllComponents(RangeReferenceInput);
    inputs[1]!.vm.$emit("update:modelValue", "=Sheet1!$D$1");
    await wrapper.vm.$nextTick();
    await wrapper.setProps({
      suspended: true,
      initial: { range: "=Sheet1!$A$1:$B$2", rowInput: "", columnInput: "" },
    });
    await wrapper.setProps({ suspended: false });
    await wrapper.vm.$nextTick();

    expect(wrapper.findAllComponents(RangeReferenceInput)[1]!.props("modelValue")).toBe(
      "=Sheet1!$D$1",
    );
    wrapper.findComponent(Dialog).vm.$emit("confirm");
    expect(wrapper.emitted("apply")).toHaveLength(1);
  });
});
