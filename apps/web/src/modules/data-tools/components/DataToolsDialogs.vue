<script setup lang="ts">
import DataValidationDialog from "./DataValidationDialog.vue";
import RemoveDuplicatesDialog from "./RemoveDuplicatesDialog.vue";
import SortDialog from "./SortDialog.vue";
import SubtotalDialog from "./SubtotalDialog.vue";
import TextToColumnsDialog from "./TextToColumnsDialog.vue";
import type { ExcelDateSystem } from "@idea10/core/formula";
import type { RangeReferenceSelectionOptions } from "../../../shared/range-reference/useRangeReferencePicker";
import type {
  DataToolColumn,
  DataValidationDraft,
  DataValidationInitial,
  RemoveDuplicatesDraft,
  SortDraft,
  SortInitial,
  SortColorColumn,
  SubtotalDraft,
  TextToColumnsDraft,
} from "../data-tools-types";

withDefaults(
  defineProps<{
    sortVisible: boolean;
    textToColumnsVisible: boolean;
    removeDuplicatesVisible: boolean;
    validationVisible: boolean;
    subtotalVisible: boolean;
    columns: readonly DataToolColumn[];
    sortInitial?: SortInitial;
    sortColorColumns?: readonly SortColorColumn[];
    dateSystem?: ExcelDateSystem;
    rangeLabel?: string;
    splitPreview?: readonly string[];
    splitColumnCount?: number;
    splitPreviewRows?: readonly { row: number; values: readonly string[] }[];
    splitSourceRows?: readonly { row: number; text: string }[];
    splitDestinationLabel?: string;
    splitPicking?: boolean;
    selectSplitReference?: (current: string) => Promise<string | undefined>;
    duplicateCount?: number;
    validationInitial?: DataValidationInitial;
    validationSuspended?: boolean;
    selectValidationReference?: (
      current: string,
      options?: RangeReferenceSelectionOptions,
    ) => Promise<string | undefined>;
    hasSubtotals?: boolean;
  }>(),
  {
    rangeLabel: "",
    dateSystem: "1900",
    sortInitial: undefined,
    sortColorColumns: () => [],
    splitPreview: () => [],
    duplicateCount: undefined,
    validationInitial: undefined,
    validationSuspended: false,
    selectValidationReference: undefined,
    hasSubtotals: false,
  },
);
const emit = defineEmits<{
  closeSort: [];
  sort: [draft: SortDraft];
  closeTextToColumns: [];
  textToColumns: [draft: TextToColumnsDraft];
  textToColumnsDraftChange: [draft: TextToColumnsDraft];
  closeRemoveDuplicates: [];
  removeDuplicates: [draft: RemoveDuplicatesDraft];
  removeDuplicatesDraftChange: [draft: RemoveDuplicatesDraft];
  closeValidation: [];
  validation: [draft: DataValidationDraft];
  clearValidation: [];
  closeSubtotal: [];
  subtotal: [draft: SubtotalDraft];
  removeSubtotals: [];
}>();
</script>
<template>
  <SortDialog
    :visible="sortVisible"
    :columns="columns"
    :range-label="rangeLabel"
    :initial="sortInitial"
    :color-columns="sortColorColumns"
    @close="emit('closeSort')"
    @apply="emit('sort', $event)"
  />
  <TextToColumnsDialog
    :visible="textToColumnsVisible"
    :preview="splitPreview"
    :total-column-count="splitColumnCount"
    :preview-rows="splitPreviewRows"
    :source-rows="splitSourceRows"
    :range-label="rangeLabel"
    :destination-label="splitDestinationLabel"
    :picking="splitPicking"
    :select-reference="selectSplitReference"
    @close="emit('closeTextToColumns')"
    @apply="emit('textToColumns', $event)"
    @draft-change="emit('textToColumnsDraftChange', $event)"
  />
  <RemoveDuplicatesDialog
    :visible="removeDuplicatesVisible"
    :columns="columns"
    :removal-count="duplicateCount"
    @close="emit('closeRemoveDuplicates')"
    @apply="emit('removeDuplicates', $event)"
    @draft-change="emit('removeDuplicatesDraftChange', $event)"
  />
  <DataValidationDialog
    :visible="validationVisible"
    :initial="validationInitial"
    :suspended="validationSuspended"
    :select-reference="selectValidationReference"
    :date-system="dateSystem"
    @close="emit('closeValidation')"
    @apply="emit('validation', $event)"
    @clear="emit('clearValidation')"
  />
  <SubtotalDialog
    :visible="subtotalVisible"
    :columns="columns"
    :has-subtotals="hasSubtotals"
    @close="emit('closeSubtotal')"
    @apply="emit('subtotal', $event)"
    @remove-all="emit('removeSubtotals')"
  />
</template>
