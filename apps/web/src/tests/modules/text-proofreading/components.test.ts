import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, expect, test } from "vitest";
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
  await click("通用校对");
  expect(document.body.textContent).toContain("再接再励");
  await click("更正");
  expect(getCellContent(sheet, { row: 0, column: 0 })).toEqual({
    kind: "literal",
    value: "再接再厉",
  });
  expect(document.body.textContent).toContain("未发现匹配的错词");
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
  await click("通用校对");
  const buttons = [
    ...document.body.querySelectorAll<HTMLButtonElement>(".word-review__toolbar-actions button"),
  ];
  const add = buttons.find((button) => button.textContent?.trim() === "添加正词")!;
  const bulk = buttons.find((button) => button.textContent?.trim() === "将所选加入正词")!;
  expect(add.disabled).toBe(false);
  expect(bulk.disabled).toBe(true);
  add.click();
  await nextTick();
  const input = document.body.querySelector<HTMLInputElement>(".word-dictionary input")!;
  input.value = "再接再励";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await nextTick();
  await click("保存");
  expect(controller.panel.value).toBe("general");
  expect(controller.dictionary.value.accepted).toContain("再接再励");
  expect(controller.issues.value).toHaveLength(0);
});
