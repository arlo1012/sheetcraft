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
  type CellNote,
  type Sheet,
  type Workbook,
} from "@idea10/core/workbook";
import { DEFAULT_NOTE_BOX } from "../../shared/cell-notes/note-box";
import { useAppI18n } from "../../shared/i18n";

type NoteDraft = { address: CellAddress; text: string; author: string; box?: CellNote["box"] };
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
  const showAllNotes = ref(false);
  const hiddenNoteKeys = ref<string[]>([]);
  const allNotesHidden = ref(false);
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

  function close(restoreFocus = true): void {
    const wasOpen = Boolean(draft.value);
    draft.value = undefined;
    target = undefined;
    error.value = "";
    if (wasOpen && restoreFocus) void nextTick(options.focus);
  }
  watch([options.getGeneration, () => options.getSheet().id], () => {
    close(false);
    showAllNotes.value = false;
    allNotesHidden.value = false;
    hiddenNoteKeys.value = [];
  });
  watch(
    [
      options.getGeneration,
      () => options.getSheet().id,
      () => options.getAddress().row,
      () => options.getAddress().column,
    ],
    () => {
      const address = anchor(options.getAddress());
      showActiveNote.value =
        !allNotesHidden.value && !hiddenNoteKeys.value.includes(`${address.row}:${address.column}`);
    },
  );

  function edit(address = options.getAddress()): void {
    if (options.isBusy() || options.getSheet().properties.protected || !options.finishEditing())
      return;
    const cell = { ...anchor(address) };
    const note = getCellNote(options.getSheet(), cell);
    target = { sheetId: options.getSheet().id, address: cell, revision: options.getRevision() };
    draft.value = {
      address: cell,
      text: note?.text ?? "",
      // TODO: Resolve the default author from the current user and follow identity changes; preserve existing note authors.
      author: note?.author ?? "Administrator",
      ...(note?.box ? { box: { ...note.box } } : {}),
    };
    error.value = "";
  }
  function save(value: { text: string; author: string; restoreFocus?: boolean }): void {
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
        ...(draft.value.box ? { box: { ...draft.value.box } } : {}),
      };
      const existing = getCellNote(sheet, target.address);
      if (
        (existing?.text === note.text &&
          (existing.author ?? "") === (note.author ?? "") &&
          JSON.stringify(existing.box) === JSON.stringify(note.box)) ||
        options.execute(
          createSetCellNoteCommand(options.getWorkbook(), sheet.id, target.address, note),
        )
      ) {
        showActiveNote.value = true;
        close(value.restoreFocus !== false);
      } else error.value = t("review.failed");
    } catch {
      error.value = t("review.failed");
    }
  }
  function updateBox(value: { address: CellAddress; box: NonNullable<CellNote["box"]> }): void {
    if (options.isBusy() || options.getSheet().properties.protected) return;
    const cell = anchor(value.address);
    if (draft.value && target?.address.row === cell.row && target.address.column === cell.column) {
      draft.value = { ...draft.value, box: { ...value.box } };
      return;
    }
    const sheet = options.getSheet();
    const note = getCellNote(sheet, cell);
    if (!note) return;
    options.execute(
      createSetCellNoteCommand(options.getWorkbook(), sheet.id, cell, {
        ...note,
        box: { ...value.box },
      }),
    );
  }
  function resetBox(mode: "position" | "size" | "all"): void {
    if (options.isBusy() || options.getSheet().properties.protected || !options.finishEditing())
      return;
    const address = draft.value?.address ?? anchor(options.getAddress());
    const note = getCellNote(options.getSheet(), address);
    if (!note && !draft.value) return;
    const box = { ...(draft.value?.box ?? note?.box ?? DEFAULT_NOTE_BOX) };
    if (mode !== "size") {
      box.offsetX = DEFAULT_NOTE_BOX.offsetX;
      box.offsetY = DEFAULT_NOTE_BOX.offsetY;
    }
    if (mode !== "position") {
      box.width = DEFAULT_NOTE_BOX.width;
      box.height = DEFAULT_NOTE_BOX.height;
    }
    updateBox({ address, box });
  }
  function setAllNotesVisible(visible: boolean): void {
    if (options.isBusy() || !options.finishEditing()) return;
    allNotesHidden.value = !visible;
    hiddenNoteKeys.value = [];
    showAllNotes.value = visible;
    showActiveNote.value = visible;
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
    allNotesHidden.value = false;
    const key = `${address.row}:${address.column}`;
    hiddenNoteKeys.value = hiddenNoteKeys.value.filter((value) => value !== key);
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
    allNotesHidden.value = false;
    showActiveNote.value = !showActiveNote.value;
    if (showAllNotes.value) {
      const address = anchor(options.getAddress());
      const key = `${address.row}:${address.column}`;
      hiddenNoteKeys.value = showActiveNote.value
        ? hiddenNoteKeys.value.filter((value) => value !== key)
        : [...hiddenNoteKeys.value, key];
    }
  }
  return {
    notes,
    draft,
    error,
    showActiveNote,
    showAllNotes,
    hiddenNoteKeys,
    setAllNotesVisible,
    resetBox,
    hasNote,
    hasSelectedNotes,
    edit,
    close,
    save,
    updateBox,
    remove,
    navigate,
    step,
    toggleNote,
  };
}
