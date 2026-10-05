import { defineComponent, h, nextTick, ref } from "vue";
import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { WorkbookCommand } from "@idea10/core/commands";
import { createSequentialIdFactory } from "@idea10/core/runtime";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  undoWorkbookCommand,
} from "@idea10/core/history";
import {
  createSheet,
  createWorkbook,
  getActiveSheet,
  getCellContent,
  setCellContent,
  type CellRange,
} from "@idea10/core/workbook";
import { useTextReviewController } from "../../../modules/review-tools/useTextReviewController";
import { createAppI18n } from "../../../shared/i18n";
import type {
  TextReviewRequest,
  TextReviewResult,
} from "../../../modules/review-tools/text-review";

const messages = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), info: vi.fn() }));
vi.mock("tdesign-vue-next/es/message", () => ({ MessagePlugin: messages }));

class ReviewWorker {
  static instances: ReviewWorker[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  postMessage = vi.fn<(request: TextReviewRequest) => void>();
  terminate = vi.fn();
  constructor() {
    ReviewWorker.instances.push(this);
  }
  respond(conversions: TextReviewResult["conversions"]) {
    this.onmessage?.({
      data: { ok: true, result: { issues: [], conversions, truncated: false } },
    } as MessageEvent);
  }
}

let wrapper: ReturnType<typeof mount> | undefined;
function fixture() {
  const workbook = createWorkbook({ id: "conversion", sheetId: "sheet" });
  const sheet = getActiveSheet(workbook);
  const other = createSheet("Other", "other");
  workbook.sheets.set(other.id, other);
  setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: "汉语" });
  setCellContent(sheet, { row: 10, column: 0 }, { kind: "literal", value: "软件" });
  setCellContent(other, { row: 0, column: 0 }, { kind: "literal", value: "其他" });
  const session = createWorkbookSession({ workbook, idFactory: createSequentialIdFactory() });
  const revision = ref(0);
  const selection = ref<CellRange>({
    start: { row: 0, column: 0 },
    end: { row: 1, column: 1 },
  });
  const execute = vi.fn((command: WorkbookCommand) => {
    const changed = executeWorkbookCommand(session, command);
    if (changed) revision.value++;
    return changed;
  });
  let review!: ReturnType<typeof useTextReviewController>;
  wrapper = mount(
    defineComponent({
      setup() {
        review = useTextReviewController({
          getWorkbook: () => workbook,
          getSheet: () => sheet,
          getSelection: () => selection.value,
          getGeneration: () => 0,
          getRevision: () => revision.value,
          isBusy: () => false,
          finishEditing: () => true,
          execute,
        });
        return () => h("div");
      },
    }),
    { global: { plugins: [createAppI18n("en-US")] } },
  );
  return { sheet, other, session, revision, execute, review };
}

beforeEach(() => {
  ReviewWorker.instances = [];
  vi.clearAllMocks();
  vi.stubGlobal("Worker", ReviewWorker);
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  vi.unstubAllGlobals();
});

describe("text conversion controller", () => {
  test.each(["to-simplified", "to-traditional"] as const)(
    "%s converts the current sheet even with a multi-cell selection",
    (mode) => {
      const f = fixture();
      f.review.open(mode);
      const request = ReviewWorker.instances[0]!.postMessage.mock.calls[0]![0];
      expect(request.mode).toBe(mode);
      expect(request.cells.map((cell) => cell.text)).toEqual(["汉语", "软件"]);
      expect(request.cells.every((cell) => cell.sheetId === f.sheet.id)).toBe(true);
      expect(f.review.scope.value).toBe("sheet");
    },
  );

  test("automatically applies all conversions as one undoable command and closes", () => {
    const f = fixture();
    f.review.open("to-traditional");
    ReviewWorker.instances[0]!.respond([
      { cell: 0, text: "漢語" },
      { cell: 1, text: "軟件" },
    ]);
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(getCellContent(f.sheet, { row: 0, column: 0 })).toEqual({
      kind: "literal",
      value: "漢語",
    });
    expect(getCellContent(f.sheet, { row: 10, column: 0 })).toEqual({
      kind: "literal",
      value: "軟件",
    });
    expect(getCellContent(f.other, { row: 0, column: 0 })).toEqual({
      kind: "literal",
      value: "其他",
    });
    expect(f.review.mode.value).toBeUndefined();
    expect(f.review.busy.value).toBe(false);
    undoWorkbookCommand(f.session);
    expect(getCellContent(f.sheet, { row: 0, column: 0 })).toEqual({
      kind: "literal",
      value: "汉语",
    });
    expect(getCellContent(f.sheet, { row: 10, column: 0 })).toEqual({
      kind: "literal",
      value: "软件",
    });
  });

  test("reuses the worker after a completed conversion and terminates it on unmount", () => {
    const f = fixture();
    f.review.open("to-traditional");
    const worker = ReviewWorker.instances[0]!;
    worker.respond([{ cell: 0, text: "漢語" }]);
    f.review.open("to-simplified");
    expect(ReviewWorker.instances).toHaveLength(1);
    expect(worker.postMessage).toHaveBeenCalledTimes(2);
    expect(worker.terminate).not.toHaveBeenCalled();
    wrapper!.unmount();
    wrapper = undefined;
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  test("rejects a result captured before a workbook revision and reports the error", async () => {
    const f = fixture();
    f.review.open("to-traditional");
    f.revision.value++;
    ReviewWorker.instances[0]!.respond([{ cell: 0, text: "漢語" }]);
    expect(f.execute).not.toHaveBeenCalled();
    expect(getCellContent(f.sheet, { row: 0, column: 0 })).toEqual({
      kind: "literal",
      value: "汉语",
    });
    await nextTick();
    expect(messages.error).toHaveBeenCalledTimes(1);
    expect(f.review.busy.value).toBe(false);
  });
});
