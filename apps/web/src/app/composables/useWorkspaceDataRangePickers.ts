import { computed, ref, watch, type Ref } from "vue";
import type { Sheet, Workbook } from "@sheetcraft/core/workbook";
import type { AdvancedFilterDraft } from "../../modules/data-tools/data-tools-types";
import type { useDataToolsController } from "../../modules/data-tools/useDataToolsController";
import {
  useRangeReferencePicker,
  type RangeReferenceSelectionOptions,
} from "../../shared/range-reference/useRangeReferencePicker";

type DataToolsController = ReturnType<typeof useDataToolsController>;

type WorkspaceDataRangePickersOptions = {
  getWorkbook: () => Workbook;
  getActiveSheet: () => Sheet;
  getWorkbookGeneration: () => number;
  selectSheet: (sheetId: string) => void;
  dataTools: DataToolsController;
  duplicateErrorOptionsVisible: Ref<boolean>;
};

/** Owns the range-reference pickers and modal-open coordination for all Data Tools dialogs. */
export function useWorkspaceDataRangePickers(options: WorkspaceDataRangePickersOptions) {
  const { dataTools } = options;
  const {
    simulationDialog,
    proofreadingVisible,
    fillNumberSequenceVisible,
    fillRankVisible,
    fillSeriesVisible,
    fillBlanksVisible,
    fillTextVisible,
    fillCurrentDateVisible,
    textToColumnsVisible: dataTextToColumnsVisible,
    validationVisible: dataValidationVisible,
    advancedFilterVisible: dataAdvancedFilterVisible,
    advancedFilterDraft: dataAdvancedFilterDraft,
    duplicateValuesVisible,
    duplicateValuesDraft,
    comparisonVisible,
    comparisonDraft,
    lookupFillVisible,
    lookupFillDraft,
    dropdownListVisible,
    consolidateVisible,
    consolidateDraft,
  } = dataTools;

  const getSheetName = () => options.getActiveSheet().name;

  const simulationRangePicker = useRangeReferencePicker(getSheetName);
  const { active: pickingSimulationRange, reference: pickedSimulationReference } =
    simulationRangePicker;
  async function selectSimulationReference(
    current: string,
    pickerOptions: RangeReferenceSelectionOptions = { singleCell: true },
  ): Promise<string | undefined> {
    const workbook = options.getWorkbook();
    const generation = options.getWorkbookGeneration();
    const sheetId = options.getActiveSheet().id;
    const dialog = simulationDialog.value;
    const selected = await simulationRangePicker.selectReference(current, pickerOptions);
    if (
      options.getWorkbook() !== workbook ||
      options.getWorkbookGeneration() !== generation ||
      !dialog ||
      simulationDialog.value !== dialog
    )
      return undefined;
    if (options.getActiveSheet().id !== sheetId && workbook.sheets.has(sheetId))
      options.selectSheet(sheetId);
    return selected;
  }
  watch(simulationDialog, () => simulationRangePicker.cancel());

  const proofreadingRangePicker = useRangeReferencePicker(getSheetName);
  const { active: pickingProofreadingRange, reference: pickedProofreadingReference } =
    proofreadingRangePicker;
  async function selectProofreadingReference(current: string): Promise<string | undefined> {
    const workbook = options.getWorkbook();
    const generation = options.getWorkbookGeneration();
    const sheetId = options.getActiveSheet().id;
    const selected = await proofreadingRangePicker.selectReference(current);
    if (
      options.getWorkbook() !== workbook ||
      options.getWorkbookGeneration() !== generation ||
      !proofreadingVisible.value
    )
      return undefined;
    if (options.getActiveSheet().id !== sheetId && workbook.sheets.has(sheetId))
      options.selectSheet(sheetId);
    return selected;
  }
  watch(proofreadingVisible, (visible) => {
    if (!visible) proofreadingRangePicker.cancel();
  });

  const splitRangePicker = useRangeReferencePicker(getSheetName, { singleCell: true });
  const { active: pickingSplitRange, reference: pickedSplitReference } = splitRangePicker;
  async function selectSplitReference(
    current: string,
    pickerOptions: RangeReferenceSelectionOptions = { singleCell: true },
  ): Promise<string | undefined> {
    const workbook = options.getWorkbook();
    const sheetId = options.getActiveSheet().id;
    const selected = await splitRangePicker.selectReference(current, pickerOptions);
    if (options.getWorkbook() !== workbook || !dataTextToColumnsVisible.value) return undefined;
    if (options.getActiveSheet().id !== sheetId && workbook.sheets.has(sheetId))
      options.selectSheet(sheetId);
    return selected;
  }
  watch(dataTextToColumnsVisible, (visible) => {
    if (!visible) splitRangePicker.cancel();
  });

  const validationRangePicker = useRangeReferencePicker(getSheetName, { singleCell: true });
  const { active: pickingValidationRange, reference: pickedValidationReference } =
    validationRangePicker;
  const validationPickingCell = ref(true);
  async function selectValidationReference(
    current: string,
    pickerOptions: RangeReferenceSelectionOptions = { singleCell: true },
  ): Promise<string | undefined> {
    const workbook = options.getWorkbook();
    const sheetId = options.getActiveSheet().id;
    validationPickingCell.value = pickerOptions.singleCell === true;
    const selected = await validationRangePicker.selectReference(current, pickerOptions);
    if (options.getWorkbook() !== workbook || !dataValidationVisible.value) return undefined;
    if (options.getActiveSheet().id !== sheetId && workbook.sheets.has(sheetId))
      options.selectSheet(sheetId);
    return selected;
  }
  watch(dataValidationVisible, (visible) => {
    if (!visible) validationRangePicker.cancel();
  });

  const dropdownRangePicker = useRangeReferencePicker(getSheetName);
  const { active: pickingDropdownRange, reference: pickedDropdownReference } = dropdownRangePicker;
  async function selectDropdownReference(current: string): Promise<string | undefined> {
    const workbook = options.getWorkbook();
    const sheetId = options.getActiveSheet().id;
    const selected = await dropdownRangePicker.selectReference(current);
    if (options.getWorkbook() !== workbook || !dropdownListVisible.value) return undefined;
    if (options.getActiveSheet().id !== sheetId && workbook.sheets.has(sheetId))
      options.selectSheet(sheetId);
    return selected;
  }
  watch(dropdownListVisible, (visible) => {
    if (!visible) dropdownRangePicker.cancel();
  });

  const fillRankRangePicker = useRangeReferencePicker(getSheetName);
  const { active: pickingFillRankRange, reference: pickedFillRankReference } = fillRankRangePicker;
  const fillRankPickingDestination = ref(false);
  async function selectFillRankReference(
    current: string,
    singleCell: boolean,
  ): Promise<string | undefined> {
    const workbook = options.getWorkbook();
    const generation = options.getWorkbookGeneration();
    const sheetId = options.getActiveSheet().id;
    fillRankPickingDestination.value = singleCell;
    const selected = await fillRankRangePicker.selectReference(current, { singleCell });
    if (
      options.getWorkbook() !== workbook ||
      options.getWorkbookGeneration() !== generation ||
      !fillRankVisible.value
    )
      return undefined;
    if (options.getActiveSheet().id !== sheetId && workbook.sheets.has(sheetId))
      options.selectSheet(sheetId);
    return selected;
  }
  const selectFillRankSource = (current: string) => selectFillRankReference(current, false);
  const selectFillRankDestination = (current: string) => selectFillRankReference(current, true);
  watch(fillRankVisible, (visible) => {
    if (!visible) fillRankRangePicker.cancel();
  });

  const advancedRangePicker = useRangeReferencePicker(getSheetName);
  const { active: pickingAdvancedRange, reference: pickedAdvancedReference } = advancedRangePicker;
  const advancedRangeField = ref<"listRange" | "criteriaRange" | "destination">();
  async function pickAdvancedFilterRange(field: "listRange" | "criteriaRange" | "destination") {
    advancedRangeField.value = field;
    const selected = await advancedRangePicker.selectReference(
      dataAdvancedFilterDraft.value[field],
    );
    advancedRangeField.value = undefined;
    if (selected !== undefined && dataAdvancedFilterVisible.value) {
      const draft: AdvancedFilterDraft = { ...dataAdvancedFilterDraft.value, [field]: selected };
      dataTools.updateAdvancedFilterDraft(draft);
    }
  }
  watch(dataAdvancedFilterVisible, (visible) => {
    if (!visible) advancedRangePicker.cancel();
  });

  const duplicateRangePicker = useRangeReferencePicker(getSheetName);
  const { active: pickingDuplicateRange, reference: pickedDuplicateReference } =
    duplicateRangePicker;
  async function pickDuplicateRange() {
    const selected = await duplicateRangePicker.selectReference(duplicateValuesDraft.value.range);
    if (selected !== undefined && duplicateValuesVisible.value) {
      dataTools.updateDuplicateValuesDraft({ ...duplicateValuesDraft.value, range: selected });
    }
  }
  watch(duplicateValuesVisible, (visible) => {
    if (!visible) duplicateRangePicker.cancel();
  });

  const comparisonRangePicker = useRangeReferencePicker(getSheetName);
  const { active: pickingComparisonRange, reference: pickedComparisonReference } =
    comparisonRangePicker;
  async function pickComparisonRange(field: "firstRange" | "secondRange") {
    const selected = await comparisonRangePicker.selectReference(comparisonDraft.value[field]);
    if (selected !== undefined && comparisonVisible.value) {
      dataTools.updateComparisonDraft({ ...comparisonDraft.value, [field]: selected });
    }
  }
  watch(comparisonVisible, (visible) => {
    if (!visible) comparisonRangePicker.cancel();
  });

  const lookupFillRangePicker = useRangeReferencePicker(getSheetName);
  const { active: pickingLookupFillRange, reference: pickedLookupFillReference } =
    lookupFillRangePicker;
  async function pickLookupFillRange(field: "sourceRange" | "targetRange") {
    const selected = await lookupFillRangePicker.selectReference(lookupFillDraft.value[field]);
    if (selected !== undefined && lookupFillVisible.value) {
      dataTools.updateLookupFillDraft({ ...lookupFillDraft.value, [field]: selected });
    }
  }
  watch(lookupFillVisible, (visible) => {
    if (!visible) lookupFillRangePicker.cancel();
  });

  const consolidateRangePicker = useRangeReferencePicker(getSheetName);
  const { active: pickingConsolidateRange, reference: pickedConsolidateReference } =
    consolidateRangePicker;
  async function selectConsolidateSourceReference(current: string): Promise<string | undefined> {
    const workbook = options.getWorkbook();
    const selected = await consolidateRangePicker.selectReference(current);
    return options.getWorkbook() === workbook && consolidateVisible.value ? selected : undefined;
  }
  async function pickConsolidateRange() {
    const selected = await consolidateRangePicker.selectReference(
      consolidateDraft.value.destination,
      { singleCell: true },
    );
    if (selected === undefined || !consolidateVisible.value) return;
    dataTools.updateConsolidateDraft({ ...consolidateDraft.value, destination: selected });
  }
  watch(consolidateVisible, (visible) => {
    if (!visible) consolidateRangePicker.cancel();
  });

  const dataToolsModalOpen = computed(
    () =>
      (Boolean(simulationDialog.value) && !pickingSimulationRange.value) ||
      (proofreadingVisible.value && !pickingProofreadingRange.value) ||
      fillNumberSequenceVisible.value ||
      (fillRankVisible.value && !pickingFillRankRange.value) ||
      fillSeriesVisible.value ||
      fillBlanksVisible.value ||
      fillTextVisible.value ||
      fillCurrentDateVisible.value ||
      options.duplicateErrorOptionsVisible.value ||
      dataTools.sortVisible.value ||
      (dataTools.textToColumnsVisible.value && !pickingSplitRange.value) ||
      dataTools.removeDuplicatesVisible.value ||
      (dataValidationVisible.value && !pickingValidationRange.value) ||
      dataTools.subtotalVisible.value ||
      (dataAdvancedFilterVisible.value && !pickingAdvancedRange.value) ||
      (duplicateValuesVisible.value && !pickingDuplicateRange.value) ||
      (comparisonVisible.value && !pickingComparisonRange.value) ||
      (lookupFillVisible.value && !pickingLookupFillRange.value) ||
      (dropdownListVisible.value && !pickingDropdownRange.value) ||
      (consolidateVisible.value && !pickingConsolidateRange.value),
  );

  const activeDataRangePicker = computed(() => {
    if (pickingSimulationRange.value) return simulationRangePicker;
    if (pickingProofreadingRange.value) return proofreadingRangePicker;
    if (pickingSplitRange.value) return splitRangePicker;
    if (pickingFillRankRange.value) return fillRankRangePicker;
    if (pickingValidationRange.value) return validationRangePicker;
    if (pickingDropdownRange.value) return dropdownRangePicker;
    if (pickingConsolidateRange.value) return consolidateRangePicker;
    if (pickingLookupFillRange.value) return lookupFillRangePicker;
    if (pickingComparisonRange.value) return comparisonRangePicker;
    if (pickingDuplicateRange.value) return duplicateRangePicker;
    if (pickingAdvancedRange.value) return advancedRangePicker;
    return undefined;
  });

  return {
    simulationRangePicker,
    pickingSimulationRange,
    pickedSimulationReference,
    selectSimulationReference,
    proofreadingRangePicker,
    pickingProofreadingRange,
    pickedProofreadingReference,
    selectProofreadingReference,
    splitRangePicker,
    pickingSplitRange,
    pickedSplitReference,
    selectSplitReference,
    validationRangePicker,
    pickingValidationRange,
    pickedValidationReference,
    validationPickingCell,
    selectValidationReference,
    dropdownRangePicker,
    pickingDropdownRange,
    pickedDropdownReference,
    selectDropdownReference,
    fillRankRangePicker,
    pickingFillRankRange,
    pickedFillRankReference,
    fillRankPickingDestination,
    selectFillRankSource,
    selectFillRankDestination,
    advancedRangePicker,
    pickingAdvancedRange,
    pickedAdvancedReference,
    advancedRangeField,
    pickAdvancedFilterRange,
    duplicateRangePicker,
    pickingDuplicateRange,
    pickedDuplicateReference,
    pickDuplicateRange,
    comparisonRangePicker,
    pickingComparisonRange,
    pickedComparisonReference,
    pickComparisonRange,
    lookupFillRangePicker,
    pickingLookupFillRange,
    pickedLookupFillReference,
    pickLookupFillRange,
    consolidateRangePicker,
    pickingConsolidateRange,
    pickedConsolidateReference,
    selectConsolidateSourceReference,
    pickConsolidateRange,
    dataToolsModalOpen,
    activeDataRangePicker,
  };
}
