import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import { Input } from "tdesign-vue-next/es/input";
import { Select } from "tdesign-vue-next/es/select";
import type { PivotFieldGroup } from "@idea10/core/pivot-tables";
import { datePartsToExcelSerial, type ExcelDateSystem } from "@idea10/core/formula";
import PivotGroupingDialog from "../../../modules/pivot-tables/components/PivotGroupingDialog.vue";
import { createAppI18n } from "../../../shared/i18n";
const mounted: Array<{ unmount(): void }> = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
});
function setup(
  initial: PivotFieldGroup = {
    field: 2,
    kind: "number",
    start: 10,
    end: 40,
    interval: 10,
  },
  dateSystem: ExcelDateSystem = "1900",
  disabled = false,
  locale: "en-US" | "zh-CN" = "en-US",
) {
  const wrapper = mount(PivotGroupingDialog, {
    attachTo: document.body,
    props: {
      draft: { tableId: "pivot", field: 2, name: "Amount", initial },
      dateSystem,
      disabled,
    },
    global: { plugins: [createAppI18n(locale)] },
  });
  mounted.push(wrapper);
  return wrapper;
}
async function confirm(wrapper: ReturnType<typeof setup>) {
  wrapper.findComponent(Dialog).vm.$emit("confirm");
  await flushPromises();
}
async function input(wrapper: ReturnType<typeof setup>, index: number, text: string) {
  const inputs = wrapper.findAllComponents(Input);
  (index === 2 ? inputs.at(-1)! : inputs[index]!).vm.$emit("update:modelValue", text);
  await flushPromises();
}
function serial(year: number, month: number, day: number, system: ExcelDateSystem) {
  return datePartsToExcelSerial(
    { year, month, day, hour: 0, minute: 0, second: 0, millisecond: 0 },
    system,
  );
}
describe("pivot grouping dialog", () => {
  test("edits stay staged until confirm and cancel emits no group", async () => {
    const wrapper = setup();
    await input(wrapper, 2, "5");
    expect(wrapper.emitted("apply")).toBeUndefined();
    wrapper.findComponent(Dialog).vm.$emit("close");
    expect(wrapper.emitted("close")).toEqual([[]]);
    expect(wrapper.emitted("apply")).toBeUndefined();
  });
  test("automatic bounds use raw source limits and disable their inputs", async () => {
    const wrapper = setup();
    await wrapper.setProps({
      draft: {
        tableId: "pivot",
        field: 2,
        name: "Amount",
        min: -4.5,
        max: 52.25,
        initial: { field: 2, kind: "number", start: 10, end: 40, interval: 10 },
      },
    });
    const checkboxes = wrapper.findAllComponents(Checkbox);
    expect(checkboxes.map((checkbox) => checkbox.props("modelValue"))).toEqual([false, false]);
    checkboxes[0]!.vm.$emit("update:modelValue", true);
    checkboxes[1]!.vm.$emit("update:modelValue", true);
    await flushPromises();
    expect(
      wrapper
        .findAllComponents(Input)
        .slice(0, 2)
        .map((control) => control.props("disabled")),
    ).toEqual([true, true]);
    await confirm(wrapper);
    expect(wrapper.emitted("apply")?.[0]?.[0]).toEqual({
      field: 2,
      kind: "number",
      start: -4.5,
      end: 52.25,
      interval: 10,
      autoStart: true,
      autoEnd: true,
    });
  });
  test("existing automatic flags stay staged and can be cancelled or cleared", async () => {
    const initial: PivotFieldGroup = {
      field: 2,
      kind: "number",
      start: 10,
      end: 40,
      interval: 10,
      autoStart: true,
      autoEnd: true,
    };
    const wrapper = setup(initial);
    expect(
      wrapper.findAllComponents(Checkbox).map((checkbox) => checkbox.props("modelValue")),
    ).toEqual([true, true]);
    for (const checkbox of wrapper.findAllComponents(Checkbox))
      checkbox.vm.$emit("update:modelValue", false);
    await flushPromises();
    expect(
      wrapper
        .findAllComponents(Input)
        .slice(0, 2)
        .map((control) => control.props("disabled")),
    ).toEqual([false, false]);
    wrapper.findComponent(Dialog).vm.$emit("close");
    expect(wrapper.emitted("apply")).toBeUndefined();
    expect(initial).toMatchObject({ autoStart: true, autoEnd: true });
    await confirm(wrapper);
    expect(wrapper.emitted("apply")?.[0]?.[0]).toEqual({
      field: 2,
      kind: "number",
      start: 10,
      end: 40,
      interval: 10,
    });
  });
  test("automatic date limits preserve the exact raw serial range", async () => {
    const initial: PivotFieldGroup = {
      field: 2,
      kind: "date",
      unit: "days",
      start: 46023,
      end: 46030,
      interval: 1,
      autoStart: true,
      autoEnd: true,
    };
    const wrapper = setup(initial);
    await wrapper.setProps({
      draft: {
        tableId: "pivot",
        field: 2,
        name: "Amount",
        initial,
        min: 46023.5,
        max: 46030.25,
      },
    });
    await confirm(wrapper);
    expect(wrapper.emitted("apply")?.[0]?.[0]).toMatchObject({
      start: 46023.5,
      end: 46030.25,
      autoStart: true,
      autoEnd: true,
    });
  });
  test("numeric start, end and decimal interval are emitted unchanged", async () => {
    const wrapper = setup();
    await input(wrapper, 0, "-2.5");
    await input(wrapper, 1, "5");
    await input(wrapper, 2, "0.5");
    await confirm(wrapper);
    expect(wrapper.emitted("apply")).toEqual([
      [{ field: 2, kind: "number", start: -2.5, end: 5, interval: 0.5 }],
    ]);
  });
  test.each([
    ["", "40", "10"],
    ["20", "10", "1"],
    ["0", "40", "0"],
    ["0", "1000000", "1"],
    ["NaN", "40", "1"],
  ])("invalid or oversized bounds %j cannot be confirmed", async (start, end, interval) => {
    const wrapper = setup();
    await input(wrapper, 0, start!);
    await input(wrapper, 1, end!);
    await input(wrapper, 2, interval!);
    expect(wrapper.findComponent(Dialog).props("confirmBtn")).toMatchObject({
      disabled: true,
    });
    await confirm(wrapper);
    expect(wrapper.emitted("apply")).toBeUndefined();
  });
  test.each(["1900", "1904"] as const)(
    "date input uses the current %s epoch and includes the end date",
    async (system) => {
      const start = serial(2026, 1, 1, system),
        end = serial(2026, 3, 1, system);
      const wrapper = setup(
        { field: 2, kind: "date", unit: "months", start, end, interval: 1 },
        system,
      );
      expect(wrapper.findAllComponents(Input)[0]!.props("modelValue")).toBe("2026-01-01");
      await confirm(wrapper);
      const group = wrapper.emitted("apply")![0]![0] as PivotFieldGroup;
      expect(group).toMatchObject({
        kind: "date",
        unit: "months",
        start,
        interval: 1,
      });
      expect(group.end).toBeCloseTo(end + 1 - 1 / 86400000, 8);
    },
  );
  test("Excel serial 60 remains the valid 1900-02-29 grouping boundary", async () => {
    const wrapper = setup({
      field: 2,
      kind: "date",
      unit: "days",
      start: 60,
      end: 61,
      interval: 1,
    });
    expect(wrapper.findAllComponents(Input)[0]!.props("modelValue")).toBe("1900-02-29");
    await confirm(wrapper);
    expect(wrapper.emitted("apply")?.[0]?.[0]).toMatchObject({
      start: 60,
      kind: "date",
      unit: "days",
    });
  });
  test("date grouping offers all seven periods and localizes month labels", async () => {
    const wrapper = setup(
      {
        field: 2,
        kind: "date",
        unit: "months",
        start: 46023,
        end: 46060,
        interval: 1,
      },
      "1900",
      false,
      "zh-CN",
    );
    const options = wrapper.findComponent(Select).props("options") ?? [];
    expect(options.map((option) => ("value" in option ? option.value : undefined))).toEqual([
      "years",
      "quarters",
      "months",
      "days",
      "hours",
      "minutes",
      "seconds",
    ]);
    await confirm(wrapper);
    const group = wrapper.emitted("apply")![0]![0] as PivotFieldGroup;
    expect(group.labels?.[1]).toBe(
      new Intl.DateTimeFormat("zh-CN", {
        month: "short",
        timeZone: "UTC",
      }).format(new Date(Date.UTC(2000, 0, 1))),
    );
  });
  test("day grouping validates a positive integer interval", async () => {
    const wrapper = setup({
      field: 2,
      kind: "date",
      unit: "days",
      start: 46023,
      end: 46030,
      interval: 2,
    });
    await input(wrapper, 2, "1.5");
    await confirm(wrapper);
    expect(wrapper.emitted("apply")).toBeUndefined();
    await input(wrapper, 2, "3");
    await confirm(wrapper);
    expect(wrapper.emitted("apply")?.[0]?.[0]).toMatchObject({
      kind: "date",
      unit: "days",
      interval: 3,
    });
  });
  test("disabled confirmation leaves a valid existing group untouched", async () => {
    const wrapper = setup(undefined, "1900", true);
    await confirm(wrapper);
    expect(wrapper.emitted("apply")).toBeUndefined();
    expect(wrapper.findComponent(Dialog).props("confirmBtn")).toMatchObject({
      disabled: true,
    });
  });
});
