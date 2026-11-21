import { computed, nextTick, ref, shallowReactive, shallowRef, watch } from "vue";
import { createSetSheetPageSetupCommand, type WorkbookCommand } from "@sheetcraft/core/commands";
import type { SheetWatermark, WatermarkPreset } from "@sheetcraft/core/page-decoration";
import { DEFAULT_SHEET_PAGE_SETUP, type SheetPageSetup } from "@sheetcraft/core/page-setup";
import { isPictureGroup } from "@sheetcraft/core";
import { isFramedPictureObject } from "@sheetcraft/core/picture-object";
import type { CellAddress, CellRange, Sheet, Workbook } from "@sheetcraft/core/workbook";
import type { SheetViewMode } from "@sheetcraft/sheet-engine/page-layout";
import type { SelectionMode } from "@sheetcraft/sheet-engine/selection";
import type {
  usePageDecorationActions,
  WatermarkScope,
} from "../../modules/page-decorations/usePageDecorationActions";
import type { PageLayoutRulerUnit } from "../../modules/page-layout/components/PageLayoutRulers.vue";
import type { HeaderFooterEditTarget } from "../../modules/page-layout/header-footer-editor";
import {
  readPageMarginHistory,
  recordPageMarginHistory,
} from "../../modules/page-layout/page-margin-history";
import {
  isPresetPageMargins,
  pageMarginsMatch,
  type PageMargins,
} from "../../modules/page-layout/page-margin-presets";
import {
  formatPickedPageSetupReference,
  type PageSetupReferenceField,
} from "../../modules/page-layout/page-setup-inputs";
import {
  getPageBreakPatch,
  type PageBreakAction,
  type PageSetupTab,
} from "../../modules/page-layout/page-toolbar-actions";
import type { MessageKey } from "../../shared/i18n";
import { resolveRangeReference } from "../../shared/range-reference/formatRangeReference";
import { useRangeReferencePicker } from "../../shared/range-reference/useRangeReferencePicker";

type PageDecorationActions = ReturnType<typeof usePageDecorationActions>;

type WorkspacePageLayoutOptions = {
  getWorkbook: () => Workbook;
  getActiveSheet: () => Sheet;
  getWorkbookGeneration: () => number;
  getSelectionRange: () => CellRange;
  getActiveAddress: () => CellAddress;
  getSelectionMode: () => SelectionMode;
  isBusy: () => boolean;
  flushPendingEdit: () => boolean;
  executeCommand: (command: WorkbookCommand) => boolean;
  focusCellEditor: () => void;
  getDecorations: () => PageDecorationActions;
  showImageFeedback: (messageKey: MessageKey) => void;
  t: (key: MessageKey) => string;
};

/** Owns workspace page-layout view state, page-setup/header-footer/watermark dialogs, and print preview. */
export function useWorkspacePageLayout(options: WorkspacePageLayoutOptions) {
  const pageViewModes = shallowReactive(new Map<string, SheetViewMode>());
  const pageSetupVisible = ref(false);
  const pageSetupRangePicker = useRangeReferencePicker(() => options.getActiveSheet().name);
  const { active: pickingPageSetupRange, reference: pickedPageSetupReference } =
    pageSetupRangePicker;
  const pageSetupRangeField = ref<PageSetupReferenceField>("printArea");

  async function selectPageSetupReference(
    current: string,
    field: PageSetupReferenceField,
  ): Promise<string | undefined> {
    const workbook = options.getWorkbook();
    const generation = options.getWorkbookGeneration();
    const sheetId = options.getActiveSheet().id;
    pageSetupRangeField.value = field;
    const selected = await pageSetupRangePicker.selectReference(current);
    if (
      selected === undefined ||
      !pageSetupVisible.value ||
      options.getWorkbook() !== workbook ||
      options.getWorkbookGeneration() !== generation
    )
      return undefined;
    const resolved = resolveRangeReference(workbook, selected, sheetId);
    if (!resolved || resolved.sheetId !== sheetId) return undefined;
    return formatPickedPageSetupReference(resolved.range, field);
  }

  watch(pageSetupVisible, (visible) => {
    if (!visible) pageSetupRangePicker.cancel();
  });

  const showPageBreaksBySheet = shallowReactive(new Map<string, boolean>());
  const showPageBreaks = computed({
    get: () => showPageBreaksBySheet.get(options.getActiveSheet().id) ?? false,
    set: (show: boolean) => showPageBreaksBySheet.set(options.getActiveSheet().id, show),
  });

  const printPreviewVisible = ref(false);
  const returnToPrintPreview = ref(false);
  watch(pageSetupVisible, (visible) => {
    if (!visible && returnToPrintPreview.value) {
      returnToPrintPreview.value = false;
      printPreviewVisible.value = true;
    }
  });

  const watermarkVisible = ref(false);
  const backgroundConflictVisible = ref(false);
  const editingWatermarkPreset = shallowRef<WatermarkPreset>();
  const watermarkDialogValue = shallowRef<SheetWatermark>();
  const showPageRulers = ref(true);
  const showPageMargins = ref(false);
  const showPageWhiteSpace = ref(true);
  const pageRulerUnit = ref<PageLayoutRulerUnit>("cm");
  const pageSetupTab = ref<PageSetupTab>("page");
  const headerFooterTarget = shallowRef<HeaderFooterEditTarget>();

  function setPageWhiteSpace(value: boolean): void {
    if (!options.flushPendingEdit()) return;
    showPageWhiteSpace.value = value;
  }

  function openHeaderFooter(target: HeaderFooterEditTarget): void {
    if (options.getActiveSheet().properties.protected || !options.flushPendingEdit()) return;
    pageSetupTab.value = "header-footer";
    headerFooterTarget.value = target;
    pageSetupVisible.value = true;
  }

  const activeViewMode = computed(() => pageViewModes.get(options.getActiveSheet().id) ?? "normal");
  watch(
    [options.getActiveSheet, activeViewMode, () => options.getActiveSheet().floatingImages],
    () => {
      const sheet = options.getActiveSheet();
      if (
        activeViewMode.value === "page-layout" &&
        sheet.floatingImages.some((root) => isPictureGroup(root) || isFramedPictureObject(root))
      ) {
        pageViewModes.set(sheet.id, "normal");
        options.showImageFeedback("picture.pageLayoutUnsupported");
      }
    },
    { flush: "sync", immediate: true },
  );

  const activePageSetup = computed(
    () => options.getActiveSheet().pageSetup ?? DEFAULT_SHEET_PAGE_SETUP,
  );
  const lastCustomMargins = ref<PageMargins | undefined>(readPageMarginHistory());

  function setViewMode(mode: SheetViewMode): void {
    const sheet = options.getActiveSheet();
    if (
      mode === "page-layout" &&
      sheet.floatingImages.some((root) => isPictureGroup(root) || isFramedPictureObject(root))
    ) {
      options.showImageFeedback("picture.pageLayoutUnsupported");
      return;
    }
    if (!options.flushPendingEdit()) return;
    pageViewModes.set(sheet.id, mode);
    void nextTick(options.focusCellEditor);
  }

  function applyPageSetup(setup: SheetPageSetup): void {
    const marginsChanged = !pageMarginsMatch(activePageSetup.value.margins, setup.margins);
    const changed = options.executeCommand(
      createSetSheetPageSetupCommand(options.getActiveSheet().id, setup),
    );
    if (changed && marginsChanged && !isPresetPageMargins(setup.margins)) {
      lastCustomMargins.value = recordPageMarginHistory(setup.margins);
    }
  }

  function openPageSetup(tab: PageSetupTab): void {
    if (
      options.isBusy() ||
      options.getActiveSheet().properties.protected ||
      !options.flushPendingEdit()
    )
      return;
    headerFooterTarget.value = undefined;
    pageSetupTab.value = tab;
    pageSetupVisible.value = true;
  }

  function changePageSetup(patch: Partial<SheetPageSetup>): void {
    if (
      options.isBusy() ||
      options.getActiveSheet().properties.protected ||
      !options.flushPendingEdit()
    )
      return;
    applyPageSetup({ ...activePageSetup.value, ...patch });
  }

  function setPrintAreaFromSelection(): void {
    const { start, end } = options.getSelectionRange();
    changePageSetup({ printArea: { start: { ...start }, end: { ...end } } });
  }

  function changePageBreak(action: PageBreakAction): void {
    changePageSetup(
      getPageBreakPatch(
        activePageSetup.value,
        options.getActiveAddress(),
        options.getSelectionMode(),
        action,
      ),
    );
  }

  function applyWatermark(watermark: SheetWatermark): void {
    options.getDecorations().setWatermark(watermark);
  }

  async function saveCustomWatermark(
    watermark: SheetWatermark,
    scope: WatermarkScope,
    imageFile?: File,
  ): Promise<void> {
    if (options.isBusy()) return;
    if (
      await options.getDecorations().applyWatermark(watermark, scope, imageFile, {
        id: editingWatermarkPreset.value?.id,
        name:
          watermark.text.trim() ||
          imageFile?.name ||
          editingWatermarkPreset.value?.name ||
          options.t("pageDecoration.imageWatermark"),
      })
    ) {
      watermarkVisible.value = false;
    }
  }

  function openWatermark(preset?: WatermarkPreset, watermark?: SheetWatermark): void {
    if (options.isBusy() || options.getActiveSheet().properties.protected) return;
    if (!options.flushPendingEdit()) return;
    editingWatermarkPreset.value = preset;
    watermarkDialogValue.value = preset?.watermark ?? watermark;
    watermarkVisible.value = true;
  }

  function applyWatermarkPreset(preset: WatermarkPreset, scope: WatermarkScope): void {
    if (options.isBusy()) return;
    void options.getDecorations().applyWatermark(preset.watermark, scope);
  }

  function openPrintPreview(): void {
    if (options.isBusy()) return;
    if (!options.flushPendingEdit()) return;
    printPreviewVisible.value = true;
  }

  function openPrintPageSetup(): void {
    openPageSetup("page");
    if (!pageSetupVisible.value) return;
    returnToPrintPreview.value = true;
    printPreviewVisible.value = false;
  }

  function savePageSetup(setup: SheetPageSetup): void {
    if (options.isBusy() || options.getActiveSheet().properties.protected) return;
    applyPageSetup(setup);
    pageSetupVisible.value = false;
    void nextTick(options.focusCellEditor);
  }

  watch(options.getWorkbookGeneration, () => {
    returnToPrintPreview.value = false;
    pageViewModes.clear();
    showPageBreaksBySheet.clear();
    printPreviewVisible.value = false;
    watermarkVisible.value = false;
    pageSetupVisible.value = false;
  });

  watch(
    () => options.getActiveSheet().id,
    () => {
      returnToPrintPreview.value = false;
      pageSetupVisible.value = false;
      printPreviewVisible.value = false;
      watermarkVisible.value = false;
    },
  );

  return {
    pageSetupVisible,
    pageSetupRangePicker,
    pickingPageSetupRange,
    pickedPageSetupReference,
    pageSetupRangeField,
    selectPageSetupReference,
    showPageBreaks,
    printPreviewVisible,
    returnToPrintPreview,
    watermarkVisible,
    backgroundConflictVisible,
    editingWatermarkPreset,
    watermarkDialogValue,
    showPageRulers,
    showPageMargins,
    showPageWhiteSpace,
    pageRulerUnit,
    pageSetupTab,
    headerFooterTarget,
    activeViewMode,
    activePageSetup,
    lastCustomMargins,
    setPageWhiteSpace,
    openHeaderFooter,
    setViewMode,
    applyPageSetup,
    openPageSetup,
    changePageSetup,
    setPrintAreaFromSelection,
    changePageBreak,
    applyWatermark,
    saveCustomWatermark,
    openWatermark,
    applyWatermarkPreset,
    openPrintPreview,
    openPrintPageSetup,
    savePageSetup,
  };
}
