import { ref, shallowRef, watch } from "vue";
import type { Workbook, Sheet, CellRange, CellAddress } from "@idea10/core/workbook";
import type { WorkbookCommand } from "@idea10/core/commands";
import { useAppI18n } from "../../shared/i18n";
import {
  collectReviewText,
  createReviewTextCommand,
  type ReviewTextCell,
} from "../../shared/workbook-text-edits";
import {
  emptyDictionary,
  parseDictionary,
  scanWords,
  wordChanges,
  type WordIssue,
} from "./proofreading";
const storageKey = "idea10.word-proofreading.v1";
export function useWordProofreading(options: {
  getWorkbook: () => Workbook;
  getSheet: () => Sheet;
  getSelection: () => CellRange;
  getGeneration: () => number;
  getRevision: () => number;
  isBusy: () => boolean;
  finishEditing: () => boolean;
  execute: (command: WorkbookCommand) => boolean;
  navigateToCell?: (sheetId: string, address: CellAddress) => void;
}) {
  const { t } = useAppI18n();
  const dictionary = ref(emptyDictionary());
  const error = ref("");
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) dictionary.value = parseDictionary(JSON.parse(saved));
  } catch {
    error.value = t("wordProof.storageRead");
  }
  const panel = ref<"review" | "accepted" | "mistake" | "dictionary" | "settings">();
  const scope = ref<"selection" | "sheet" | "workbook">("sheet");
  const cells = shallowRef<ReviewTextCell[]>([]);
  const issues = shallowRef<WordIssue[]>([]);
  const selected = ref<string[]>([]);
  const skipped = ref(0),
    truncated = ref(false),
    scanned = ref(false);
  let revision = 0;
  let navigating = false;
  function invalidate() {
    cells.value = [];
    issues.value = [];
    selected.value = [];
    scanned.value = false;
  }
  watch(scope, invalidate, { flush: "sync" });
  watch(
    [options.getGeneration, () => options.getSheet().id],
    ([generation], [previousGeneration]) => {
      if (navigating && generation === previousGeneration) return;
      panel.value = undefined;
      invalidate();
    },
    { flush: "sync" },
  );
  function scan() {
    if (options.isBusy() || !options.finishEditing()) return;
    error.value = "";
    const collected = collectReviewText(
      options.getWorkbook(),
      options.getSheet().id,
      options.getSelection(),
      scope.value,
    );
    cells.value = collected.cells;
    skipped.value = collected.skipped;
    revision = options.getRevision();
    const result = scanWords(cells.value, dictionary.value);
    issues.value = result.issues;
    truncated.value = result.truncated;
    selected.value = [];
    scanned.value = true;
  }
  function open(value: NonNullable<typeof panel.value>) {
    if (options.isBusy() || !options.finishEditing()) return;
    panel.value = value;
    if (value === "review") scan();
  }
  function save(value: unknown) {
    try {
      const parsed = parseDictionary(value);
      localStorage.setItem(storageKey, JSON.stringify(parsed));
      dictionary.value = parsed;
      error.value = "";
      invalidate();
      return true;
    } catch {
      error.value = t("wordProof.storageWrite");
      return false;
    }
  }
  function add(word: string, replacement?: string, originalWord?: string) {
    word = word.trim();
    replacement = replacement?.trim();
    if (
      !word ||
      word.length > 100 ||
      replacement === "" ||
      replacement === word ||
      (replacement?.length ?? 0) > 100
    ) {
      error.value = t("wordProof.invalidWord");
      return false;
    }
    const next = parseDictionary(dictionary.value);
    next.accepted = next.accepted.filter((v) => v !== word && v !== originalWord);
    next.mistakes = next.mistakes.filter((v) => v.word !== word && v.word !== originalWord);
    if (replacement === undefined) next.accepted.push(word);
    else next.mistakes.push({ word, replacement });
    return save(next);
  }
  function addMistakes(
    rows: readonly { word: string; replacement: string }[],
    originalWord?: string,
  ) {
    const entries = rows
      .map((row) => ({ word: row.word.trim(), replacement: row.replacement.trim() }))
      .filter((row) => row.word || row.replacement);
    if (
      !entries.length ||
      entries.some(
        (row) =>
          !row.word ||
          !row.replacement ||
          row.word === row.replacement ||
          row.word.length > 100 ||
          row.replacement.length > 100,
      )
    ) {
      error.value = t("wordProof.invalidWord");
      return false;
    }
    const next = parseDictionary(dictionary.value);
    const replacements = new Map(entries.map((row) => [row.word, row]));
    next.accepted = next.accepted.filter(
      (word) => !replacements.has(word) && word !== originalWord,
    );
    next.mistakes = next.mistakes.filter(
      (row) => !replacements.has(row.word) && row.word !== originalWord,
    );
    next.mistakes.push(...replacements.values());
    return save(next);
  }
  function addAcceptedWords(input: string) {
    const words = [
      ...new Set(
        input
          .split(/\r\n|[\r\n]/)
          .map((word) => word.trim())
          .filter(Boolean),
      ),
    ];
    if (!words.length || words.some((word) => word.length > 100)) {
      error.value = t("wordProof.invalidWord");
      return false;
    }
    const next = parseDictionary(dictionary.value);
    next.accepted = [...new Set([...next.accepted, ...words])];
    const accepted = new Set(words);
    next.mistakes = next.mistakes.filter((rule) => !accepted.has(rule.word));
    return save(next);
  }
  function acceptSelected() {
    const words = new Set(
      issues.value.filter((issue) => selected.value.includes(issue.id)).map((issue) => issue.word),
    );
    if (!words.size) return false;
    const next = parseDictionary(dictionary.value);
    next.accepted = [...new Set([...next.accepted, ...words])];
    next.mistakes = next.mistakes.filter((rule) => !words.has(rule.word));
    if (!save(next)) return false;
    scan();
    return true;
  }
  function apply(targets: readonly WordIssue[]) {
    if (!targets.length || options.isBusy()) return;
    if (revision !== options.getRevision()) {
      error.value = t("wordProof.stale");
      return;
    }
    try {
      const changes = wordChanges(cells.value, targets);
      if (!options.execute(createReviewTextCommand(options.getWorkbook(), cells.value, changes)))
        return;
      revision = options.getRevision();
      const removed = new Set(targets.map((i) => i.id));
      issues.value = issues.value
        .filter((i) => !removed.has(i.id))
        .map((issue) => {
          const shift = targets
            .filter((t) => t.cell === issue.cell && t.start < issue.start)
            .reduce((sum, t) => sum + t.replacement.length - (t.end - t.start), 0);
          return { ...issue, start: issue.start + shift, end: issue.end + shift };
        });
      cells.value = cells.value.map((cell, index) => {
        const change = changes.find((c) => c.cell === index);
        return change ? { ...cell, text: change.text } : cell;
      });
      selected.value = [];
      error.value = "";
    } catch {
      error.value = t("wordProof.stale");
    }
  }
  function selectIssue(id: string) {
    if (options.isBusy() || !options.navigateToCell) return;
    const issue = issues.value.find((item) => item.id === id);
    const cell = issue && cells.value[issue.cell];
    if (!cell) return;
    const current = revision === options.getRevision();
    navigating = true;
    try {
      options.navigateToCell(cell.sheetId, cell.address);
      if (current) revision = options.getRevision();
    } finally {
      navigating = false;
    }
  }
  function ignore(ids: readonly string[]) {
    issues.value = issues.value.filter((i) => !ids.includes(i.id));
    selected.value = selected.value.filter((id) => !ids.includes(id));
  }
  return {
    dictionary,
    error,
    panel,
    scope,
    cells,
    issues,
    selected,
    skipped,
    truncated,
    scanned,
    open,
    scan,
    save,
    add,
    apply,
    addMistakes,
    addAcceptedWords,
    acceptSelected,
    selectIssue,
    ignore,
  };
}
