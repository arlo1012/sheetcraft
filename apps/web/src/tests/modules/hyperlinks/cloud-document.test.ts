// 未执行：按用户要求仅编写测试，延期到最终阶段统一运行。
import { mount } from "@vue/test-utils";
import { defineComponent, h, nextTick } from "vue";
import { afterEach, describe, expect, test, vi } from "vitest";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Input } from "tdesign-vue-next/es/input";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  undoWorkbookCommand,
} from "@sheetcraft/core/history";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import {
  createWorkbook,
  getActiveSheet,
  getCellContent,
  getCellHyperlink,
  setCellContent,
  setCellStyle,
} from "@sheetcraft/core/workbook";
import HyperlinkDialog from "../../../modules/hyperlinks/components/HyperlinkDialog.vue";
import { useHyperlinksController } from "../../../modules/hyperlinks/useHyperlinksController";
import { createAppI18n } from "../../../shared/i18n";

const mounted: Array<{ unmount(): void }> = [];
afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.replaceChildren();
});
const address = { row: 0, column: 0 };
const cloudUrl = "https://docs.example.test/share/report";
function fixture() {
  const workbook = createWorkbook({ id: "cloud-document", sheetId: "sheet" });
  const sheet = getActiveSheet(workbook);
  const session = createWorkbookSession({ workbook, idFactory: createSequentialIdFactory() });
  const execute = vi.fn((command: Parameters<typeof executeWorkbookCommand>[1]) =>
    executeWorkbookCommand(session, command),
  );
  const finishEditing = vi.fn(() => true);
  let links!: ReturnType<typeof useHyperlinksController>;
  const wrapper = mount(
    defineComponent({
      setup() {
        links = useHyperlinksController({
          getWorkbook: () => workbook,
          getSheet: () => sheet,
          getAddress: () => address,
          getGeneration: () => 0,
          isBusy: () => false,
          finishEditing,
          execute,
          navigate: vi.fn(),
          openExternal: vi.fn(),
          focus: vi.fn(),
        });
        return () =>
          links.dialog.value
            ? h(HyperlinkDialog, {
                key: links.dialog.value.dialogId,
                draft: links.dialog.value.initial,
                error: links.error.value,
                onConfirm: links.dialog.value.confirm,
                onCancel: links.dialog.value.cancel,
                onRemove: links.dialog.value.remove,
              })
            : null;
      },
    }),
    { attachTo: document.body, global: { plugins: [createAppI18n("en-US")] } },
  );
  mounted.push(wrapper);
  return { workbook, sheet, session, links, wrapper, execute, finishEditing };
}

describe("document entry cloud hyperlink controller", () => {
  test("opens on the cloud page and saves a filename into an initially empty cell in one undoable action", async () => {
    const f = fixture();
    f.links.editCloudDocument("Quarterly report.docx");
    await nextTick();
    expect(f.wrapper.get('[data-hyperlink-kind="cloud"]').attributes("aria-selected")).toBe("true");
    expect(f.links.draft.value?.displayText).toBe("Quarterly report.docx");
    const target = f.wrapper
      .findAllComponents(Input)
      .find((entry) => entry.attributes("data-hyperlink-cloud") !== undefined)!;
    target.vm.$emit("update:modelValue", cloudUrl);
    await nextTick();
    f.wrapper.getComponent(Dialog).vm.$emit("confirm");
    expect(getCellContent(f.sheet, address)).toEqual({
      kind: "literal",
      value: "Quarterly report.docx",
    });
    expect(getCellHyperlink(f.sheet, address)?.target).toBe(cloudUrl);
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.sheet.drawings ?? []).toEqual([]);
    undoWorkbookCommand(f.session);
    expect(getCellContent(f.sheet, address)).toBeNull();
    expect(getCellHyperlink(f.sheet, address)).toBeUndefined();
  });

  test.each([
    { kind: "literal", value: "Existing text" },
    { kind: "literal", value: 42 },
    { kind: "formula", formula: { source: "=1+1" } },
  ] as const)(
    "keeps existing $kind content when a cloud document filename is supplied",
    (content) => {
      const f = fixture();
      setCellContent(f.sheet, address, content);
      const before = structuredClone(getCellContent(f.sheet, address));
      f.links.editCloudDocument("Replacement.docx");
      expect(f.links.draft.value?.displayText).not.toBe("Replacement.docx");
      f.links.save({
        target: cloudUrl,
        displayText: f.links.draft.value!.displayText,
        tooltip: "",
      });
      expect(getCellContent(f.sheet, address)).toEqual(before);
      expect(getCellHyperlink(f.sheet, address)?.target).toBe(cloudUrl);
    },
  );

  test("ordinary edit retains its web page and empty display draft after the cloud entry closes", async () => {
    const f = fixture();
    f.links.editCloudDocument("Cloud.docx");
    f.links.close();
    f.links.edit();
    await nextTick();
    expect(f.links.draft.value?.displayText).toBe("");
    expect(f.wrapper.get('[data-hyperlink-kind="web"]').attributes("aria-selected")).toBe("true");
    expect(f.wrapper.get('[data-hyperlink-kind="cloud"]').attributes("aria-selected")).toBe(
      "false",
    );
  });

  test.each([
    { editObjects: false, insertHyperlinks: false },
    { editObjects: true, insertHyperlinks: false },
    { editObjects: false, insertHyperlinks: true },
    { editObjects: true, insertHyperlinks: true },
  ])("cloud links use insertHyperlinks independently of editObjects: %j", (permissions) => {
    const f = fixture();
    setCellStyle(f.sheet, address, { unlocked: true });
    f.sheet.properties.protected = true;
    f.sheet.protection = {
      editableRanges: [],
      ...(permissions.editObjects ? { editObjects: true as const } : {}),
      ...(permissions.insertHyperlinks ? { insertHyperlinks: true as const } : {}),
    };
    f.links.editCloudDocument("Protected.docx");
    expect(Boolean(f.links.dialog.value)).toBe(permissions.insertHyperlinks);
    expect(f.execute).not.toHaveBeenCalled();
  });
});
