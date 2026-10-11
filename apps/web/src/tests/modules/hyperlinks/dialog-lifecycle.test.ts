import { mount } from "@vue/test-utils";
import { defineComponent, h, nextTick, ref, shallowRef } from "vue";
import { afterEach, describe, expect, test, vi } from "vitest";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Input } from "tdesign-vue-next/es/input";
import { WorkbookDomainError } from "@sheetcraft/core/errors";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { createWorkbookSession, executeWorkbookCommand } from "@sheetcraft/core/history";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import {
  createSheet,
  createWorkbook,
  getActiveSheet,
  getCellHyperlink,
  insertSheet,
  setCellContent,
  setCellHyperlink,
} from "@sheetcraft/core/workbook";
import HyperlinkDialog from "../../../modules/hyperlinks/components/HyperlinkDialog.vue";
import {
  useHyperlinksController,
  type HyperlinkInput,
} from "../../../modules/hyperlinks/useHyperlinksController";
import { createAppI18n } from "../../../shared/i18n";

const mounted: Array<{ unmount(): void }> = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
});
function fixture() {
  const workbook = createWorkbook({ id: "link-lifecycle", sheetId: "sheet" });
  const sheet = getActiveSheet(workbook);
  setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: "Original" });
  const session = createWorkbookSession({ workbook, idFactory: createSequentialIdFactory() });
  const currentWorkbook = shallowRef(workbook);
  const currentSheet = shallowRef(sheet);
  const address = ref({ row: 0, column: 0 });
  const generation = ref(0);
  const refusals: string[] = [];
  const execute = vi.fn((command: Parameters<typeof executeWorkbookCommand>[1]) => {
    try {
      return executeWorkbookCommand(session, command);
    } catch (error) {
      if (error instanceof WorkbookDomainError && error.data.code === "sheet_protected") {
        refusals.push(error.data.code);
        return false;
      }
      throw error;
    }
  });
  let links!: ReturnType<typeof useHyperlinksController>;
  const wrapper = mount(
    defineComponent({
      setup() {
        links = useHyperlinksController({
          getWorkbook: () => currentWorkbook.value,
          getSheet: () => currentSheet.value,
          getAddress: () => address.value,
          getGeneration: () => generation.value,
          isBusy: () => false,
          finishEditing: () => true,
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
                onRemove: links.dialog.value.remove,
                onCancel: links.dialog.value.cancel,
              })
            : null;
      },
    }),
    { attachTo: document.body, global: { plugins: [createAppI18n("en-US")] } },
  );
  mounted.push(wrapper);
  return {
    workbook,
    sheet,
    session,
    links,
    wrapper,
    currentWorkbook,
    currentSheet,
    address,
    generation,
    execute,
    refusals,
  };
}
function callbacks(wrapper: ReturnType<typeof mount>) {
  const props = wrapper.getComponent(HyperlinkDialog).vm.$.vnode.props!;
  return {
    confirm: props.onConfirm as (value: HyperlinkInput) => void,
    remove: props.onRemove as () => void,
    cancel: props.onCancel as () => void,
  };
}
const edited = {
  target: "https://example.test/edited",
  displayText: "Unsaved label",
  tooltip: "Unsaved tooltip",
};

describe("hyperlink dialog bounded lifecycle", () => {
  test("same-address reopen mounts fresh fields and detaches the old callbacks", async () => {
    const f = fixture();
    f.links.edit();
    await nextTick();
    const old = callbacks(f.wrapper);
    const oldUid = f.wrapper.getComponent(HyperlinkDialog).vm.$.uid;
    f.wrapper.findAllComponents(Input)[1]!.vm.$emit("update:modelValue", "Unsaved old target");
    setCellContent(f.sheet, f.address.value, { kind: "literal", value: "Updated source" });
    f.links.edit();
    await nextTick();
    expect(f.wrapper.getComponent(HyperlinkDialog).vm.$.uid).not.toBe(oldUid);
    expect(f.wrapper.findAllComponents(Input).map((input) => input.props("modelValue"))).toEqual([
      "Updated source",
      "",
      "",
    ]);
    const before = serializeWorkbook(f.workbook);
    old.confirm(edited);
    old.cancel();
    await nextTick();
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    expect(f.links.draft.value?.displayText).toBe("Updated source");
  });
  test("a thrown confirmation preserves edited local fields and shows failure", async () => {
    const f = fixture();
    f.links.edit();
    await nextTick();
    const uid = f.wrapper.getComponent(HyperlinkDialog).vm.$.uid;
    f.wrapper.findAllComponents(Input)[1]!.vm.$emit("update:modelValue", edited.target);
    await nextTick();
    const before = serializeWorkbook(f.workbook);
    f.execute.mockImplementationOnce(() => {
      throw new Error("Synthetic refusal");
    });
    f.wrapper.getComponent(Dialog).vm.$emit("confirm");
    await nextTick();
    expect(f.wrapper.getComponent(HyperlinkDialog).vm.$.uid).toBe(uid);
    expect(f.wrapper.findAllComponents(Input)[1]!.props("modelValue")).toBe(edited.target);
    expect(f.links.error.value).toBeTruthy();
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    expect(f.session.history.undoStack).toHaveLength(0);
  });
  test("successful execution cannot close a newer reentrant dialog", async () => {
    const f = fixture();
    f.links.edit();
    await nextTick();
    const old = callbacks(f.wrapper);
    f.execute.mockImplementationOnce((command) => {
      const changed = executeWorkbookCommand(f.session, command);
      f.address.value = { row: 0, column: 1 };
      f.links.edit();
      return changed;
    });
    old.confirm(edited);
    await nextTick();
    expect(getCellHyperlink(f.sheet, { row: 0, column: 0 })?.target).toBe(edited.target);
    expect(f.links.draft.value?.displayText).toBe("");
    expect(f.wrapper.findComponent(HyperlinkDialog).exists()).toBe(true);
    expect(f.session.history.undoStack).toHaveLength(1);
  });
  test("an unchanged existing-link confirmation remains accepted by the existing Core command", async () => {
    const f = fixture();
    setCellHyperlink(f.sheet, f.address.value, { target: edited.target });
    f.links.edit();
    await nextTick();
    callbacks(f.wrapper).confirm({ target: edited.target, displayText: "Original", tooltip: "" });
    await nextTick();
    expect(f.execute.mock.results[0]!.value).toBe(true);
    expect(f.links.draft.value).toBeUndefined();
    expect(getCellHyperlink(f.sheet, f.address.value)?.target).toBe(edited.target);
  });
  test.each(["save", "remove"] as const)(
    "real Core protection refusal preserves the %s dialog and local draft for retry",
    async (action) => {
      const f = fixture();
      if (action === "remove")
        setCellHyperlink(f.sheet, f.address.value, { target: "https://example.test/original" });
      f.sheet.properties.protected = true;
      f.sheet.protection = { editableRanges: [], insertHyperlinks: true };
      f.links.edit();
      await nextTick();
      const uid = f.wrapper.getComponent(HyperlinkDialog).vm.$.uid;
      const inputs = f.wrapper.findAllComponents(Input);
      inputs[0]!.vm.$emit("update:modelValue", edited.displayText);
      inputs[1]!.vm.$emit("update:modelValue", edited.target);
      inputs[2]!.vm.$emit("update:modelValue", edited.tooltip);
      await nextTick();
      const before = serializeWorkbook(f.workbook);
      if (action === "save") f.wrapper.getComponent(Dialog).vm.$emit("confirm");
      else f.wrapper.getComponent(HyperlinkDialog).vm.$emit("remove");
      await nextTick();
      expect(f.refusals).toEqual(["sheet_protected"]);
      expect(serializeWorkbook(f.workbook)).toEqual(before);
      expect(f.session.history.undoStack).toHaveLength(0);
      expect(f.wrapper.getComponent(HyperlinkDialog).vm.$.uid).toBe(uid);
      expect(f.wrapper.findAllComponents(Input).map((input) => input.props("modelValue"))).toEqual([
        edited.displayText,
        edited.target,
        edited.tooltip,
      ]);
      expect(f.links.error.value).toBeTruthy();
      f.sheet.properties.protected = false;
      if (action === "save") f.wrapper.getComponent(Dialog).vm.$emit("confirm");
      else f.wrapper.getComponent(HyperlinkDialog).vm.$emit("remove");
      await nextTick();
      expect(f.links.draft.value).toBeUndefined();
      expect(f.session.history.undoStack).toHaveLength(1);
      expect(getCellHyperlink(f.sheet, f.address.value)?.target).toBe(
        action === "save" ? edited.target : undefined,
      );
    },
  );
  test.each(["confirm", "remove", "cancel"] as const)(
    "a dismissed %s callback cannot act on a newer editor",
    async (action) => {
      const f = fixture();
      f.links.edit();
      await nextTick();
      const old = callbacks(f.wrapper);
      old.cancel();
      await nextTick();
      f.address.value = { row: 0, column: 1 };
      setCellHyperlink(f.sheet, f.address.value, { target: "https://example.test/new" });
      f.links.edit();
      await nextTick();
      const before = serializeWorkbook(f.workbook);
      const uid = f.wrapper.getComponent(HyperlinkDialog).vm.$.uid;
      if (action === "confirm") old.confirm(edited);
      else old[action]();
      await nextTick();
      expect(serializeWorkbook(f.workbook)).toEqual(before);
      expect(f.session.history.undoStack).toHaveLength(0);
      expect(f.wrapper.getComponent(HyperlinkDialog).vm.$.uid).toBe(uid);
    },
  );
  test.each(["generation", "sheet", "address"] as const)(
    "a captured editor cannot save after %s changes",
    async (change) => {
      const f = fixture();
      f.links.edit();
      await nextTick();
      const old = callbacks(f.wrapper);
      if (change === "generation") {
        const replacement = createWorkbook({ id: "replacement", sheetId: "sheet" });
        f.session.workbook = replacement;
        f.currentWorkbook.value = replacement;
        f.currentSheet.value = getActiveSheet(replacement);
        f.generation.value++;
      } else if (change === "sheet") {
        const destination = createSheet("Destination", "destination");
        insertSheet(f.workbook, destination);
        f.currentSheet.value = destination;
      } else f.address.value = { row: 1, column: 0 };
      const before = serializeWorkbook(f.currentWorkbook.value);
      old.confirm(edited);
      await nextTick();
      expect(serializeWorkbook(f.currentWorkbook.value)).toEqual(before);
      expect(f.session.history.undoStack).toHaveLength(0);
      expect(f.links.draft.value).toBeUndefined();
    },
  );
});
