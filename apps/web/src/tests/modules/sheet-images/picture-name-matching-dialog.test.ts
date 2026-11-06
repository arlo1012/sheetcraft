// 未执行：按用户要求仅编写测试，避免额外内存占用。
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, test } from "vitest";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import { BaseTable } from "tdesign-vue-next/es/table";
import { createWorkbook, getActiveSheet, setCellContent } from "@sheetcraft/core/workbook";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import PictureBatchInsertDialog from "../../../modules/sheet-images/components/PictureBatchInsertDialog.vue";
import { analyzePictureNameMatches } from "../../../modules/sheet-images/picture-name-matching";
import RangeReferenceInput from "../../../shared/range-reference/RangeReferenceInput.vue";
import { createAppI18n } from "../../../shared/i18n";

const mounted: Array<{ unmount(): void }> = [];
afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.replaceChildren();
});

function fixture() {
  const workbook = createWorkbook({ id: "matching-dialog", sheetId: "sheet" });
  const sheet = getActiveSheet(workbook);
  setCellContent(sheet, { row: 2, column: 2 }, { kind: "literal", value: "alpha" });
  setCellContent(sheet, { row: 3, column: 2 }, { kind: "literal", value: "beta" });
  const range = { start: { row: 2, column: 2 }, end: { row: 4, column: 2 } };
  const fileNames = ["alpha.png", "missing.png", "beta.jpg"];
  const wrapper = mount(PictureBatchInsertDialog, {
    attachTo: document.body,
    props: {
      fileNames,
      mode: "cell",
      busy: false,
      workbook,
      sheetId: sheet.id,
      initialRange: range,
      revision: 0,
    },
    global: {
      plugins: [createAppI18n("en-US")],
      stubs: { TableHeightWrapper: { template: '<div><slot :height="200" /></div>' } },
    },
  });
  mounted.push(wrapper);
  return { wrapper, workbook, sheet, range, fileNames };
}
async function enableMatching(wrapper: ReturnType<typeof fixture>["wrapper"]) {
  const checkbox = wrapper
    .findAllComponents(Checkbox)
    .find((candidate) => candidate.text() === "Match existing picture names");
  expect(checkbox).toBeDefined();
  checkbox!.vm.$emit("update:modelValue", true);
  await nextTick();
}

describe("picture batch name matching dialog", () => {
  test("starts from the current range, shows matched destinations and skips, and confirms an explicit matching count", async () => {
    const f = fixture();
    const before = serializeWorkbook(f.workbook);
    await enableMatching(f.wrapper);
    const reference = f.wrapper.getComponent(RangeReferenceInput);
    expect(reference.props("showPicker")).toBe(false);
    expect(reference.props("modelValue")).toContain("$C$3:$C$5");
    expect(f.wrapper.getComponent(BaseTable).props("data")).toMatchObject([
      { name: "alpha.png", match: "D3" },
      { name: "missing.png", match: "No match; skipped" },
      { name: "beta.jpg", match: "D4" },
    ]);
    expect(f.wrapper.getComponent(Dialog).props("confirmBtn")).toMatchObject({
      content: "Insert 2 matched pictures",
      disabled: false,
    });

    f.wrapper.getComponent(Dialog).vm.$emit("confirm");
    const plan = analyzePictureNameMatches(
      f.workbook,
      f.sheet.id,
      f.fileNames,
      f.range,
      "vertical",
      "before",
    );
    expect(f.wrapper.emitted("confirm")).toEqual([
      [
        {
          order: [0, 1, 2],
          arrangement: "vertical",
          namePlacement: "before",
          nameMatch: { range: f.range, fingerprint: plan.fingerprint },
        },
      ],
    ]);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });

  test("rechecks source revisions and disables submission when names become ambiguous", async () => {
    const f = fixture();
    await enableMatching(f.wrapper);
    setCellContent(f.sheet, { row: 4, column: 2 }, { kind: "literal", value: "alpha" });
    const before = serializeWorkbook(f.workbook);
    await f.wrapper.setProps({ revision: 1, error: "Review changed names before inserting" });

    expect(f.wrapper.getComponent(BaseTable).props("data")).toMatchObject([
      { name: "alpha.png", match: "Duplicate names in range" },
      { name: "missing.png", match: "No match; skipped" },
      { name: "beta.jpg", match: "D4" },
    ]);
    expect(f.wrapper.getComponent(Dialog).props("confirmBtn")).toMatchObject({ disabled: true });
    expect(document.body.querySelector('[role="alert"]')?.textContent).toContain(
      "Review changed names before inserting",
    );
    f.wrapper.getComponent(Dialog).vm.$emit("confirm");
    expect(f.wrapper.emitted("confirm")).toBeUndefined();
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });

  test("allows manual range entry but blocks a range incompatible with the selected orientation", async () => {
    const f = fixture();
    await enableMatching(f.wrapper);
    f.wrapper.getComponent(RangeReferenceInput).vm.$emit("update:modelValue", "C3:D4");
    await nextTick();
    expect(f.wrapper.getComponent(Dialog).props("confirmBtn")).toMatchObject({ disabled: true });
    expect(document.body.querySelector('[role="alert"]')).not.toBeNull();
    f.wrapper.getComponent(Dialog).vm.$emit("confirm");
    expect(f.wrapper.emitted("confirm")).toBeUndefined();
  });
});
