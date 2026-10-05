import { MessagePlugin } from "tdesign-vue-next/es/message";
import { computed, onScopeDispose, ref, shallowRef, watch } from "vue";
import type { CellRange, Sheet, Workbook } from "@idea10/core/workbook";
import type { WorkbookCommand } from "@idea10/core/commands";
import { useAppI18n } from "../../shared/i18n";
import {
  collectReviewText,
  createReviewTextCommand,
  replaceSpellingIssues,
  type ReviewTextCell,
  type SpellingLanguage,
  type TextReviewMode,
  type TextReviewResult,
  type TextReviewScope,
} from "./text-review";

export function useTextReviewController(options: {
  getWorkbook: () => Workbook;
  getSheet: () => Sheet;
  getSelection: () => CellRange;
  getGeneration: () => number;
  getRevision: () => number;
  isBusy: () => boolean;
  finishEditing: () => boolean;
  execute: (command: WorkbookCommand) => boolean;
}) {
  const { t } = useAppI18n();
  const mode = ref<TextReviewMode>();
  const scope = ref<TextReviewScope>("sheet");
  const language = ref<SpellingLanguage>("en-US");
  const cells = shallowRef<ReviewTextCell[]>([]);
  const result = shallowRef<TextReviewResult>();
  const busy = ref(false),
    error = ref(""),
    skipped = ref(0);
  const ignored = ref<string[]>([]);
  const current = computed(() => result.value?.issues[0]);
  let revision = 0;
  let worker: Worker | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  function stop(dispose = true) {
    clearTimeout(timeout);
    if (dispose) {
      worker?.terminate();
      worker = undefined;
    }
    busy.value = false;
  }
  function close() {
    stop(busy.value);
    mode.value = undefined;
    cells.value = [];
    result.value = undefined;
    error.value = "";
    ignored.value = [];
  }
  watch([options.getGeneration, () => options.getSheet().id], close, { flush: "sync" });
  onScopeDispose(() => {
    close();
    stop();
  });
  watch(error, (message) => {
    if (message && mode.value !== "spelling") void MessagePlugin.error(message);
  });
  watch(
    [scope, language],
    () => {
      if (mode.value) {
        stop(busy.value);
        result.value = undefined;
        error.value = "";
      }
    },
    { flush: "sync" },
  );
  function open(value: TextReviewMode, conversionScope: "sheet" | "workbook" = "sheet") {
    if (busy.value || options.isBusy() || !options.finishEditing()) return;
    close();
    mode.value = value;
    const range = options.getSelection();
    scope.value =
      value === "spelling" &&
      (range.start.row !== range.end.row || range.start.column !== range.end.column)
        ? "selection"
        : value === "spelling"
          ? "sheet"
          : conversionScope;
    run();
  }
  function run() {
    if (!mode.value || options.isBusy()) return;
    stop(busy.value);
    error.value = "";
    result.value = undefined;
    const collected = collectReviewText(
      options.getWorkbook(),
      options.getSheet().id,
      options.getSelection(),
      scope.value,
    );
    cells.value = collected.cells;
    skipped.value = collected.skipped;
    revision = options.getRevision();
    if (!cells.value.length && mode.value !== "spelling") {
      close();
      return;
    }
    busy.value = true;
    worker ??= new Worker(new URL("./textReview.worker.ts", import.meta.url), { type: "module" });
    const failed = () => {
      stop();
      error.value = t("review.textReviewFailed");
    };
    worker.onerror = failed;
    worker.onmessageerror = failed;
    worker.onmessage = (event: MessageEvent<{ ok: boolean; result?: TextReviewResult }>) => {
      if (!event.data.ok || !event.data.result) {
        failed();
        return;
      }
      stop(false);
      if (revision !== options.getRevision()) {
        error.value = t("review.staleTarget");
        return;
      }
      result.value = event.data.result;
      if (mode.value !== "spelling") {
        if (!result.value.conversions.length || apply(result.value.conversions)) close();
        else if (!error.value) error.value = t("review.textReviewFailed");
      }
    };
    timeout = setTimeout(failed, 60_000);
    try {
      worker.postMessage({
        cells: cells.value,
        mode: mode.value,
        language: language.value,
        ignored: [...ignored.value],
      });
    } catch {
      failed();
    }
  }
  function apply(changes: NonNullable<TextReviewResult["conversions"]>) {
    if (busy.value || options.isBusy() || !changes.length) return false;
    if (revision !== options.getRevision()) {
      error.value = t("review.staleTarget");
      return false;
    }
    try {
      if (!options.execute(createReviewTextCommand(options.getWorkbook(), cells.value, changes)))
        return false;
      revision = options.getRevision();
      return true;
    } catch {
      error.value = t("review.staleTarget");
      return false;
    }
  }
  function replace(replacement: string, all = false) {
    if (!current.value || !result.value) return;
    const issues = all
      ? result.value.issues.filter((issue) => issue.word === current.value!.word)
      : [current.value];
    const changes = replaceSpellingIssues(cells.value, issues, replacement);
    if (!apply(changes)) return;
    const removed = new Set(issues);
    const nextIssues = result.value.issues
      .filter((issue) => !removed.has(issue))
      .map((issue) => {
        const shift = issues
          .filter((changed) => changed.cell === issue.cell && changed.start < issue.start)
          .reduce((sum, changed) => sum + replacement.length - (changed.end - changed.start), 0);
        return { ...issue, start: issue.start + shift, end: issue.end + shift };
      });
    cells.value = cells.value.map((cell, index) => {
      const change = changes.find((entry) => entry.cell === index);
      return change ? { ...cell, text: change.text } : cell;
    });
    result.value = { ...result.value, issues: nextIssues };
  }
  function ignore(all = false) {
    if (!current.value || !result.value) return;
    const word = current.value.word;
    if (all) ignored.value.push(word);
    result.value = {
      ...result.value,
      issues: all
        ? result.value.issues.filter((issue) => issue.word.toLowerCase() !== word.toLowerCase())
        : result.value.issues.slice(1),
    };
  }
  function convert() {
    if (result.value && apply(result.value.conversions)) close();
  }
  return {
    mode,
    scope,
    language,
    cells,
    result,
    busy,
    error,
    skipped,
    current,
    open,
    close,
    run,
    replace,
    ignore,
    convert,
  };
}
