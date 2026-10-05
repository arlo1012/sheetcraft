import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";
import {
  createWorkbook,
  getActiveSheet,
  getCellContent,
  setCellContent,
} from "@idea10/core/workbook";
import { createWorkbookSession, executeWorkbookCommand } from "@idea10/core/history";
import { createSequentialIdFactory } from "@idea10/core/runtime";
import { createAppI18n } from "../../../shared/i18n";
import { useWordProofreading } from "../../../modules/text-proofreading/useWordProofreading";
import WordReviewDialog from "../../../modules/text-proofreading/components/WordReviewDialog.vue";
import WordDictionaryDialog from "../../../modules/text-proofreading/components/WordDictionaryDialog.vue";
import ProofreadingToolbar from "../../../modules/text-proofreading/components/ProofreadingToolbar.vue";
let wrapper: ReturnType<typeof mount> | undefined;
beforeEach(() => localStorage.clear());
afterEach(() => {
  wrapper?.unmount();
  document.body.replaceChildren();
  localStorage.clear();
});
function fixture() {
  const workbook = createWorkbook({ id: "words", sheetId: "sheet" }),
    sheet = getActiveSheet(workbook);
  setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: "再接再励" });
  const session = createWorkbookSession({ workbook, idFactory: createSequentialIdFactory() });
  const revision = ref(0);
  let controller!: ReturnType<typeof useWordProofreading>;
  wrapper = mount(
    defineComponent({
      setup() {
        controller = useWordProofreading({
          getWorkbook: () => workbook,
          getSheet: () => sheet,
          getSelection: () => ({ start: { row: 0, column: 0 }, end: { row: 0, column: 0 } }),
          getGeneration: () => 0,
          getRevision: () => revision.value,
          isBusy: () => false,
          finishEditing: () => true,
          execute: (command) => {
            const changed = executeWorkbookCommand(session, command);
            if (changed) revision.value++;
            return changed;
          },
        });
        return () =>
          h("div", [
            h(ProofreadingToolbar, { busy: false, onOpen: controller.open }),
            h(WordReviewDialog, { controller }),
            h(WordDictionaryDialog, { controller }),
          ]);
      },
    }),
    { attachTo: document.body, global: { plugins: [createAppI18n("zh-CN")] } },
  );
  return { controller, sheet };
}
async function click(text: string) {
  const button = [...document.body.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === text,
  );
  expect(button).toBeDefined();
  button!.click();
  await nextTick();
}
test("opens general proofreading from its ribbon and corrects the current text", async () => {
  const { sheet } = fixture();
  await click("文字校对");
  expect(document.body.textContent).toContain("再接再励");
  await click("更正");
  expect(getCellContent(sheet, { row: 0, column: 0 })).toEqual({
    kind: "literal",
    value: "再接再厉",
  });
  expect(document.body.textContent).toContain("未发现词库匹配问题");
});
test("adds a custom mistake through the dialog and exposes it in dictionary management", async () => {
  const { controller } = fixture();
  await click("添加错词");
  const inputs = [...document.body.querySelectorAll<HTMLInputElement>(".word-dictionary input")];
  expect(inputs).toHaveLength(2);
  inputs[0]!.value = "测试错词";
  inputs[0]!.dispatchEvent(new Event("input", { bubbles: true }));
  inputs[1]!.value = "测试正词";
  inputs[1]!.dispatchEvent(new Event("input", { bubbles: true }));
  await nextTick();
  await click("保存");
  expect(controller.dictionary.value.mistakes).toEqual([
    { word: "测试错词", replacement: "测试正词" },
  ]);
  expect(controller.panel.value).toBe("dictionary");
  expect(document.body.textContent).toContain("测试正词");
});

test("opens manual accepted-word entry without selecting results and returns to review", async () => {
  const { controller } = fixture();
  await click("文字校对");
  const buttons = [
    ...document.body.querySelectorAll<HTMLButtonElement>(".word-review__toolbar-actions button"),
  ];
  const add = buttons.find((button) => button.textContent?.trim() === "添加正词")!;
  const bulk = buttons.find((button) => button.textContent?.trim() === "将所选加入正词")!;
  expect(add.disabled).toBe(false);
  expect(bulk.disabled).toBe(true);
  add.click();
  await nextTick();
  const input = document.body.querySelector<HTMLTextAreaElement>(".word-dictionary textarea")!;
  input.value = "再接再励";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await nextTick();
  await click("保存");
  expect(controller.panel.value).toBe("review");
  expect(controller.dictionary.value.accepted).toContain("再接再励");
  expect(controller.issues.value).toHaveLength(0);
});

test("pastes multiple spreadsheet rows into mistake entry and saves them", async () => {
  const { controller } = fixture();
  await click("添加错词");
  const input = document.body.querySelector<HTMLInputElement>(".word-dictionary input")!;
  const paste = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(paste, "clipboardData", {
    value: { getData: () => "错词一\t正词一\r\n错词二\t正词二\r\n" },
  });
  input.dispatchEvent(paste);
  await nextTick();
  expect(paste.defaultPrevented).toBe(true);
  expect(document.body.querySelectorAll(".word-dictionary input")).toHaveLength(4);
  await click("保存");
  expect(controller.dictionary.value.mistakes).toEqual([
    { word: "错词一", replacement: "正词一" },
    { word: "错词二", replacement: "正词二" },
  ]);
});

async function fillEntry(first: string, second: string) {
  const inputs = [...document.body.querySelectorAll<HTMLInputElement>(".dictionary-entry input")];
  inputs[0]!.value = first;
  inputs[0]!.dispatchEvent(new Event("input", { bubbles: true }));
  inputs[1]!.value = second;
  inputs[1]!.dispatchEvent(new Event("input", { bubbles: true }));
  await nextTick();
}
test("manages all categories and applies the new dictionary rules to review", async () => {
  const { controller, sheet } = fixture();
  await click("词库管理");
  await click("敏感词");
  await click("添加");
  const sensitive = document.body.querySelector<HTMLTextAreaElement>(".word-dictionary textarea")!;
  sensitive.value = "需核查";
  sensitive.dispatchEvent(new Event("input", { bubbles: true }));
  await nextTick();
  await click("保存");
  expect(controller.dictionary.value.sensitive).toEqual([{ word: "需核查", replacement: "" }]);
  await click("术语");
  await click("添加");
  const term = document.body.querySelector<HTMLTextAreaElement>(".word-dictionary textarea")!;
  term.value = "品牌再接再励";
  term.dispatchEvent(new Event("input", { bubbles: true }));
  await nextTick();
  await click("保存");
  await click("姓名职务");
  await click("添加");
  await fillEntry("张三", "经理");
  await click("保存");
  expect(controller.dictionary.value.people).toEqual([{ word: "张三", replacement: "经理" }]);
  setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: "需核查品牌再接再励" });
  controller.open("review");
  await nextTick();
  expect(controller.issues.value.map((issue) => issue.kind)).toEqual(["sensitive"]);
});
test("searches and deletes only selected entries in the active category", async () => {
  const { controller } = fixture();
  controller.addAcceptedWords("正词甲\n正词乙");
  controller.addEntries("sensitive", [{ word: "正词甲", replacement: "" }]);
  await click("词库管理");
  const search = document.body.querySelector<HTMLInputElement>(
    ".dictionary-manager__search input",
  )!;
  search.value = "正词甲";
  search.dispatchEvent(new Event("input", { bubbles: true }));
  await nextTick();
  expect(document.body.querySelectorAll(".dictionary-manager tbody tr")).toHaveLength(1);
  const checkbox = document.body.querySelector<HTMLInputElement>(
    ".dictionary-manager tbody input[type=checkbox]",
  )!;
  checkbox.click();
  await nextTick();
  await click("删除");
  expect(controller.dictionary.value.accepted).toEqual(["正词乙"]);
  expect(controller.dictionary.value.sensitive).toHaveLength(1);
});
test("stages a dictionary import and leaves saved data untouched on cancel", async () => {
  const { controller } = fixture();
  await click("词库管理");
  await click("错词");
  const input = document.body.querySelector<HTMLInputElement>(
    ".dictionary-manager input[type=file]",
  )!;
  const file = new File(["错词\t正词"], "words.tsv", { type: "text/tab-separated-values" });
  Object.defineProperty(file, "text", { value: vi.fn().mockResolvedValue("错词\t正词") });
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  input.dispatchEvent(new Event("change", { bubbles: true }));
  await flushPromises();
  expect(controller.panel.value).toBe("mistake");
  expect(controller.dictionary.value.mistakes).toEqual([]);
  expect(document.body.querySelector<HTMLInputElement>(".dictionary-entry input")!.value).toBe(
    "错词",
  );
  await click("取消");
  expect(controller.panel.value).toBe("dictionary");
  expect(controller.dictionary.value.mistakes).toEqual([]);
});

test("uses icon actions to edit and remove a single dictionary row", async () => {
  const { controller } = fixture();
  controller.addEntries("sensitive", [
    { word: "禁用甲", replacement: "" },
    { word: "禁用乙", replacement: "" },
  ]);
  await click("词库管理");
  await click("敏感词");
  const edit = document.body.querySelector<HTMLElement>(
    '.dictionary-manager__row-actions [aria-label="编辑"]',
  )!;
  edit.click();
  await nextTick();
  const input = document.body.querySelector<HTMLInputElement>(".word-dictionary input")!;
  expect(input.value).toBe("禁用甲");
  input.value = "禁用丙";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await nextTick();
  await click("保存");
  const remove = document.body.querySelector<HTMLElement>(
    '.dictionary-manager__row-actions [aria-label="删除"]',
  )!;
  remove.click();
  await nextTick();
  expect(controller.dictionary.value.sensitive).toEqual([{ word: "禁用丙", replacement: "" }]);
});
