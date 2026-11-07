// 未执行：按用户要求仅编写测试，延期到最终阶段统一运行。
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, test, vi } from "vitest";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Radio, RadioGroup } from "tdesign-vue-next/es/radio";
import { createWorkbook, getActiveSheet, setCellStyle } from "@sheetcraft/core/workbook";
import AttachmentInsertDialog from "../../../modules/attachments/components/AttachmentInsertDialog.vue";
import { useAttachmentActions } from "../../../modules/attachments/useAttachmentActions";
import { createAppI18n } from "../../../shared/i18n";

const mounted: Array<{ unmount(): void }> = [];
afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.replaceChildren();
});
function fixture(display: "document" | "icon", fileName?: string) {
  const wrapper = mount(AttachmentInsertDialog, {
    attachTo: document.body,
    props: { display, fileName, busy: false, error: false },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  return wrapper;
}
async function chooseMode(wrapper: ReturnType<typeof fixture>, mode: "file" | "cloud") {
  wrapper.getComponent(RadioGroup).vm.$emit("update:modelValue", mode);
  await nextTick();
}

describe("document insertion methods", () => {
  test("offers file and cloud modes, sending chooseCloud only after cloud confirmation", async () => {
    const wrapper = fixture("document");
    expect(wrapper.find('[data-attachment-mode="file"]').exists()).toBe(true);
    expect(wrapper.find('[data-attachment-mode="cloud"]').exists()).toBe(true);
    expect(wrapper.emitted("chooseCloud")).toBeUndefined();
    expect(wrapper.getComponent(Dialog).props("confirmBtn")).toMatchObject({ disabled: true });
    await chooseMode(wrapper, "cloud");
    expect(wrapper.emitted("chooseCloud")).toBeUndefined();
    expect(wrapper.getComponent(Dialog).props("confirmBtn")).toMatchObject({ disabled: false });
    wrapper.getComponent(Dialog).vm.$emit("confirm");
    expect(wrapper.emitted("chooseCloud")).toEqual([[]]);
    expect(wrapper.emitted("confirm")).toBeUndefined();
    expect(wrapper.emitted("chooseFile")).toBeUndefined();
  });

  test("switching back to file mode confirms the selected file as a document", async () => {
    const wrapper = fixture("document", "report.docx");
    await chooseMode(wrapper, "cloud");
    await chooseMode(wrapper, "file");
    wrapper.getComponent(Dialog).vm.$emit("confirm");
    expect(wrapper.emitted("confirm")).toEqual([["document"]]);
    expect(wrapper.emitted("chooseCloud")).toBeUndefined();
  });

  test("the icon entry only embeds a file and provides no cloud mode", () => {
    const wrapper = fixture("icon", "report.docx");
    expect(wrapper.find('[data-attachment-mode="cloud"]').exists()).toBe(false);
    wrapper.getComponent(Dialog).vm.$emit("confirm");
    expect(wrapper.emitted("confirm")).toEqual([["icon"]]);
    expect(wrapper.emitted("chooseCloud")).toBeUndefined();
  });

  test("a busy cloud confirmation stays disabled and closing emits no insertion event", async () => {
    const wrapper = fixture("document");
    await chooseMode(wrapper, "cloud");
    await wrapper.setProps({ busy: true });
    expect(wrapper.getComponent(Dialog).props("confirmBtn")).toMatchObject({ disabled: true });
    wrapper.getComponent(Dialog).vm.$emit("confirm");
    wrapper.getComponent(Dialog).vm.$emit("close");
    expect(wrapper.emitted("close")).toEqual([[]]);
    expect(wrapper.emitted("chooseCloud")).toBeUndefined();
    expect(wrapper.emitted("confirm")).toBeUndefined();
  });

  test("independent permission flags disable only their own insertion method", async () => {
    const wrapper = fixture("document", "report.docx");
    await wrapper.setProps({ fileDisabled: true, cloudDisabled: false });
    const radio = (value: string) =>
      wrapper.findAllComponents(Radio).find((entry) => entry.props("value") === value)!;
    expect(radio("file").props("disabled")).toBe(true);
    expect(radio("cloud").props("disabled")).toBe(false);
    expect(wrapper.getComponent(RadioGroup).props("modelValue")).toBe("cloud");
    expect(wrapper.getComponent(Dialog).props("confirmBtn")).toMatchObject({ disabled: false });
    await wrapper.setProps({ fileDisabled: false, cloudDisabled: true });
    expect(radio("file").props("disabled")).toBe(false);
    expect(radio("cloud").props("disabled")).toBe(true);
    expect(wrapper.getComponent(RadioGroup).props("modelValue")).toBe("file");
  });
});

describe("document entry permission admission", () => {
  test.each([
    { editObjects: false, insertHyperlinks: false },
    { editObjects: true, insertHyperlinks: false },
    { editObjects: false, insertHyperlinks: true },
    { editObjects: true, insertHyperlinks: true },
  ])(
    "document entry admits either permitted method while icon entry requires editObjects: %j",
    (permissions) => {
      const workbook = createWorkbook({ id: "document-entry", sheetId: "sheet" });
      const sheet = getActiveSheet(workbook);
      setCellStyle(sheet, { row: 0, column: 0 }, { unlocked: true });
      sheet.properties.protected = true;
      sheet.protection = {
        editableRanges: [],
        ...(permissions.editObjects ? { editObjects: true as const } : {}),
        ...(permissions.insertHyperlinks ? { insertHyperlinks: true as const } : {}),
      };
      const flush = vi.fn(() => true);
      const execute = vi.fn();
      const actions = useAttachmentActions({
        getWorkbook: () => workbook,
        getSheet: () => sheet,
        getAddress: () => ({ row: 0, column: 0 }),
        isBusy: () => false,
        flush,
        execute,
        onError: vi.fn(),
      });
      actions.requestInsert("document");
      expect(Boolean(actions.inserting.value)).toBe(
        permissions.editObjects || permissions.insertHyperlinks,
      );
      const openCloud = vi.fn();
      actions.chooseCloudDocument(openCloud);
      expect(openCloud).toHaveBeenCalledTimes(permissions.insertHyperlinks ? 1 : 0);
      actions.close();
      actions.requestInsert("icon");
      expect(Boolean(actions.inserting.value)).toBe(permissions.editObjects);
      expect(execute).not.toHaveBeenCalled();
      expect(sheet.drawings ?? []).toEqual([]);
    },
  );

  test("a locked cell cannot admit a cloud-only document insertion", () => {
    const workbook = createWorkbook({ id: "locked-document-entry", sheetId: "sheet" });
    const sheet = getActiveSheet(workbook);
    sheet.properties.protected = true;
    sheet.protection = { editableRanges: [], insertHyperlinks: true };
    const actions = useAttachmentActions({
      getWorkbook: () => workbook,
      getSheet: () => sheet,
      getAddress: () => ({ row: 0, column: 0 }),
      isBusy: () => false,
      flush: () => true,
      execute: vi.fn(),
      onError: vi.fn(),
    });
    actions.requestInsert("document");
    expect(actions.inserting.value).toBeUndefined();
  });

  test("cloud confirmation forwards the staged filename and closes the file draft without creating an object", () => {
    const workbook = createWorkbook({ id: "cloud-method", sheetId: "sheet" });
    const sheet = getActiveSheet(workbook);
    const execute = vi.fn();
    const actions = useAttachmentActions({
      getWorkbook: () => workbook,
      getSheet: () => sheet,
      getAddress: () => ({ row: 0, column: 0 }),
      isBusy: () => false,
      flush: () => true,
      execute,
      onError: vi.fn(),
    });
    const open = vi.fn();
    actions.requestInsert("document", new File(["report"], "Quarterly.docx"));
    actions.chooseCloudDocument(open);
    expect(open).toHaveBeenCalledWith("Quarterly.docx");
    expect(actions.inserting.value).toBeUndefined();
    expect(execute).not.toHaveBeenCalled();
    expect(sheet.drawings ?? []).toEqual([]);
  });
});
