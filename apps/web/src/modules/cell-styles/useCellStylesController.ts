import { computed, nextTick, ref, shallowRef, watch } from "vue";
import { MessagePlugin } from "tdesign-vue-next/es/message";
import {
  createApplyCellStyleCommand,
  createSetWorkbookCellStylesCommand,
  type WorkbookCommand,
} from "@sheetcraft/core/commands";
import type { CellStyleDefinition } from "@sheetcraft/core/cell-styles";
import {
  cloneCellStyle,
  createClearCellStylePatch,
  type CellStylePatch,
} from "@sheetcraft/core/style";
import {
  getCellStyle,
  type CellAddress,
  type CellRange,
  type Sheet,
  type Workbook,
} from "@sheetcraft/core/workbook";
import { useAppI18n } from "../../shared/i18n";
import { createBrowserIdFactory } from "../../shared/runtime/browser-id-factory";
import {
  cloneCellStyleDefinition,
  mergeCellStyleDefinitions,
  readCellStylesFile,
} from "./merge-cell-styles";

export type CellStyleDraft = {
  style?: CellStyleDefinition;
  initialStyle: CellStylePatch;
};

export function useCellStylesController(options: {
  getWorkbook: () => Workbook;
  getSheet: () => Sheet;
  getAddress: () => CellAddress;
  getSelection: () => CellRange;
  getGeneration: () => number;
  getRevision: () => number;
  isBusy: () => boolean;
  finishEditing: () => boolean;
  execute: (command: WorkbookCommand) => boolean;
  focus: () => void;
}) {
  const { t } = useAppI18n();
  const idFactory = createBrowserIdFactory();
  const styleDraft = shallowRef<CellStyleDraft>();
  const mergeOpen = ref(false);
  const importedStyles = ref<CellStyleDefinition[]>([]);
  const mergeLoading = ref(false);
  const error = ref("");
  let importSequence = 0;

  const customStyles = computed(() => {
    void options.getRevision();
    return options.getWorkbook().cellStyles ?? [];
  });
  const modalOpen = computed(() => Boolean(styleDraft.value || mergeOpen.value));

  function close(): void {
    importSequence += 1;
    styleDraft.value = undefined;
    mergeOpen.value = false;
    importedStyles.value = [];
    mergeLoading.value = false;
    error.value = "";
    void nextTick(options.focus);
  }
  watch(() => options.getGeneration(), close);

  function setError(key: "failed" | "finishEditing" | "mergeImportFailed" | "mergeStale"): void {
    error.value = t(`cellStyles.${key}`);
  }

  function begin(): boolean {
    error.value = "";
    if (!options.isBusy() && options.finishEditing()) return true;
    setError("finishEditing");
    if (!modalOpen.value) void MessagePlugin.warning(error.value);
    return false;
  }

  function execute(command: WorkbookCommand): boolean {
    try {
      options.execute(command);
      return true;
    } catch {
      setError("failed");
      if (!modalOpen.value) void MessagePlugin.warning(error.value);
      return false;
    }
  }

  function applyStyle(style: CellStyleDefinition): void {
    if (!begin()) return;
    if (execute(createApplyCellStyleCommand(options.getSheet().id, options.getSelection(), style)))
      void nextTick(options.focus);
  }

  function createStyle(): void {
    if (!begin()) return;
    styleDraft.value = {
      initialStyle: {
        ...createClearCellStylePatch(),
        ...cloneCellStyle(getCellStyle(options.getSheet(), options.getAddress())),
      },
    };
  }

  function editStyle(style: CellStyleDefinition): void {
    if (!begin()) return;
    const draft = cloneCellStyleDefinition(style);
    styleDraft.value = {
      style: draft,
      initialStyle: draft.style,
    };
  }

  function saveStyle(style: CellStyleDefinition): void {
    const saved = cloneCellStyleDefinition(style);
    const next = [...customStyles.value.filter((existing) => existing.id !== saved.id), saved];
    if (execute(createSetWorkbookCellStylesCommand(next))) close();
  }

  function deleteStyle(style: CellStyleDefinition): void {
    if (!begin()) return;
    const next = customStyles.value.filter((existing) => existing.id !== style.id);
    if (execute(createSetWorkbookCellStylesCommand(next))) void nextTick(options.focus);
  }

  function openMerge(): void {
    if (!begin()) return;
    importedStyles.value = [];
    mergeOpen.value = true;
  }

  async function importMergeFile(
    file: Pick<File, "name" | "type" | "text" | "arrayBuffer">,
  ): Promise<void> {
    if (mergeLoading.value || !mergeOpen.value) return;
    const sequence = ++importSequence;
    const generation = options.getGeneration();
    error.value = "";
    importedStyles.value = [];
    mergeLoading.value = true;
    try {
      const styles = await readCellStylesFile(file);
      if (sequence !== importSequence || !mergeOpen.value) return;
      if (generation !== options.getGeneration()) {
        setError("mergeStale");
        return;
      }
      importedStyles.value = styles;
    } catch {
      if (sequence === importSequence && mergeOpen.value) setError("mergeImportFailed");
    } finally {
      if (sequence === importSequence) mergeLoading.value = false;
    }
  }

  function mergeStyles(value: {
    styles: readonly CellStyleDefinition[];
    replaceExisting: boolean;
  }): void {
    if (!mergeOpen.value || mergeLoading.value) return;
    const next = mergeCellStyleDefinitions(
      customStyles.value,
      value.styles,
      value.replaceExisting,
      () => idFactory("cell-style"),
    );
    if (execute(createSetWorkbookCellStylesCommand(next))) close();
  }

  return {
    customStyles,
    styleDraft,
    mergeOpen,
    importedStyles,
    mergeLoading,
    modalOpen,
    error,
    applyStyle,
    createStyle,
    editStyle,
    saveStyle,
    deleteStyle,
    openMerge,
    importMergeFile,
    mergeStyles,
    close,
  };
}
