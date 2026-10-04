import { computed, nextTick, ref, shallowRef, watch } from "vue";
import {
  createClearCellNotesCommand,
  createSetCellNoteCommand,
  type WorkbookCommand,
} from "@idea10/core/commands";
import { formatCellAddress } from "@idea10/core/coordinates";
import { getMergedCellAnchor } from "@idea10/core";
import {
  getCellNote,
  type CellAddress,
  type CellRange,
  type Sheet,
  type Workbook,
} from "@idea10/core/workbook";
import { useAppI18n } from "../../shared/i18n";

type NoteDraft = { address: string; text: string; author: string };
type NoteTarget = { sheetId: string; address: CellAddress; revision: number };
export type ReviewNote = CellAddress & { address: string; text: string; author?: string };

export function useReviewController(options: {
  getWorkbook: () => Workbook;
  getSheet: () => Sheet;
  getAddress: () => CellAddress;
  getSelection: () => CellRange;
  getGeneration: () => number;
  getRevision: () => number;
  isBusy: () => boolean;
  finishEditing: () => boolean;
  execute: (command: WorkbookCommand) => boolean;
  navigate: (address: CellAddress) => void;
  focus: () => void;
}) {
  const { t } = useAppI18n();
  const showActiveNote = ref(true);
  const draft = shallowRef<NoteDraft>();
  const error = ref("");
  let target: NoteTarget | undefined;
  const anchor = (address: CellAddress) =>
    getMergedCellAnchor(options.getSheet().mergedCells, address) ?? address;
  const notes = computed<ReviewNote[]>(() => {
    void options.getRevision();
    const values: ReviewNote[] = [];
    for (const [key, cell] of options.getSheet().cells) {
      if (!cell.note) continue;
      const [row, column] = key.split(":").map(Number) as [number, number];
      values.push({ row, column, address: formatCellAddress({ row, column }), ...cell.note });
    }
    return values.sort((a, b) => a.row - b.row || a.column - b.column);
  });
  const hasNote = computed(() => {
    void options.getRevision();
    return Boolean(getCellNote(options.getSheet(), anchor(options.getAddress())));
  });
  const hasSelectedNotes = computed(() => {
    const range = options.getSelection();
    return notes.value.some(
      (note) =>
        note.row >= Math.min(range.start.row, range.end.row) &&
        note.row <= Math.max(range.start.row, range.end.row) &&
        note.column >= Math.min(range.start.column, range.end.column) &&
        note.column <= Math.max(range.start.column, range.end.column),
    );
  });

  function close(): void {
    const wasOpen = Boolean(draft.value);
    draft.value = undefined;
    target = undefined;
    error.value = "";
    if (wasOpen) void nextTick(options.focus);
  }
  watch([options.getGeneration, () => options.getSheet().id], close);
  watch(
    [
      options.getGeneration,
      () => options.getSheet().id,
      () => options.getAddress().row,
      () => options.getAddress().column,
    ],
    () => {
      showActiveNote.value = true;
    },
  );

  function edit(address = options.getAddress()): void {
    if (options.isBusy() || options.getSheet().properties.protected || !options.finishEditing())
      return;
    const cell = { ...anchor(address) };
    const note = getCellNote(options.getSheet(), cell);
    target = { sheetId: options.getSheet().id, address: cell, revision: options.getRevision() };
    draft.value = {
      address: formatCellAddress(cell),
      text: note?.text ?? "",
      author: note?.author ?? "",
    };
    error.value = "";
  }
  function save(value: { text: string; author: string }): void {
    if (!target || !draft.value || options.isBusy()) return;
    const sheet = options.getWorkbook().sheets.get(target.sheetId);
    if (!sheet || sheet.properties.protected || options.getRevision() !== target.revision) {
      error.value = t("review.staleTarget");
      return;
    }
    if (!value.text.trim()) {
      error.value = t("review.emptyText");
      return;
    }
    try {
      const note = {
        text: value.text,
        ...(value.author.trim() ? { author: value.author.trim() } : {}),
      };
      const existing = getCellNote(sheet, target.address);
      if (
        (existing?.text === note.text && (existing.author ?? "") === (note.author ?? "")) ||
        options.execute(
          createSetCellNoteCommand(options.getWorkbook(), sheet.id, target.address, note),
        )
      ) {
        showActiveNote.value = true;
        close();
      } else error.value = t("review.failed");
    } catch {
      error.value = t("review.failed");
    }
  }
  function remove(address?: CellAddress): void {
    if (options.isBusy() || options.getSheet().properties.protected || !options.finishEditing())
      return;
    const sheetId = options.getSheet().id;
    const command = address
      ? createSetCellNoteCommand(options.getWorkbook(), sheetId, anchor(address), null)
      : createClearCellNotesCommand(options.getWorkbook(), sheetId, options.getSelection());
    if (command) options.execute(command);
    void nextTick(options.focus);
  }
  function navigate(address: CellAddress): void {
    if (options.isBusy() || !options.finishEditing()) return;
    options.navigate(address);
    showActiveNote.value = true;
  }
  function step(direction: -1 | 1): void {
    if (!notes.value.length) return;
    const current = anchor(options.getAddress());
    const compare = (note: CellAddress) => note.row - current.row || note.column - current.column;
    const note =
      direction === 1
        ? (notes.value.find((value) => compare(value) > 0) ?? notes.value[0]!)
        : ([...notes.value].reverse().find((value) => compare(value) < 0) ?? notes.value.at(-1)!);
    navigate({ row: note.row, column: note.column });
  }
  function toggleNote(): void {
    if (options.isBusy() || !options.finishEditing()) return;
    showActiveNote.value = !showActiveNote.value;
  }
  return {
    notes,
    draft,
    error,
    showActiveNote,
    hasNote,
    hasSelectedNotes,
    edit,
    close,
    save,
    remove,
    navigate,
    step,
    toggleNote,
  };
}
