<script setup lang="ts">
import { computed, ref } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Radio, RadioGroup } from "tdesign-vue-next/es/radio";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import { getPivotTableSource, normalizePivotTable } from "@idea10/core/pivot-tables";
import type { Workbook } from "@idea10/core/workbook";
import type { PivotDraft } from "../usePivotActions";
import { useAppI18n } from "../../../shared/i18n";
import RangeReferenceInput from "../../../shared/range-reference/RangeReferenceInput.vue";
import OptionList from "../../../shared/option-list/OptionList.vue";
import PivotConsolidationRanges from "./PivotConsolidationRanges.vue";
import { resolvePivotDraftSource } from "../pivot-draft-source";
const props = defineProps<{
  initial: PivotDraft;
  workbook: Workbook;
  revision: number;
  disabled: boolean;
  error: boolean;
  errorReason?:
    | "invalid"
    | "overwrite"
    | "sourceOverlap"
    | "merged"
    | "spill"
    | "tableOverlap"
    | "protected"
    | "destination";
  suspended: boolean;
  selectReference: (current: string) => Promise<string | undefined>;
}>();
const emit = defineEmits<{ confirm: [draft: PivotDraft]; close: [] }>();
const { t } = useAppI18n();
const draft = ref<PivotDraft>(JSON.parse(JSON.stringify(props.initial)) as PivotDraft);
const validSource = computed(() => {
  void props.revision;
  try {
    getPivotTableSource(
      props.workbook,
      normalizePivotTable({
        ...draft.value.table,
        ...resolvePivotDraftSource(props.workbook, draft.value),
        rowFields: [],
        columnFields: [],
        values: [],
        filters: [],
      }),
    );
    return true;
  } catch {
    return false;
  }
});
const pivotOptions = computed(() => {
  void props.revision;
  return [...props.workbook.sheets.values()].flatMap((sheet) =>
    (sheet.pivotTables ?? [])
      .filter(
        (table) =>
          !(
            draft.value.existing &&
            sheet.id === draft.value.referenceSheetId &&
            table.id === draft.value.table.id
          ),
      )
      .map((table) => ({
        value: JSON.stringify([sheet.id, table.id]),
        label: `${sheet.name} · ${table.name}`,
      })),
  );
});
const selectedPivot = computed(() =>
  draft.value.sourcePivot
    ? JSON.stringify([draft.value.sourcePivot.sheetId, draft.value.sourcePivot.tableId])
    : undefined,
);
function selectPivot(value: string): void {
  if (props.disabled) return;
  const [sheetId, tableId] = JSON.parse(value) as [string, string];
  draft.value.sourcePivot = { sheetId, tableId };
}
const title = computed(() =>
  t(
    props.initial.mode === "source"
      ? "pivot.changeSource"
      : props.initial.mode === "move"
        ? "pivot.move"
        : "pivot.createTitle",
  ),
);
</script>
<template>
  <Dialog
    :visible="!suspended"
    :header="title"
    width="min(480px, calc(100vw - 32px))"
    :close-on-overlay-click="false"
    :confirm-btn="{ content: t('picture.confirm'), disabled: disabled || !validSource }"
    :cancel-btn="t('picture.cancel')"
    :confirm-on-enter="false"
    @confirm="!disabled && validSource && emit('confirm', draft)"
    @close="emit('close')"
  >
    <div class="pivot-create">
      <section v-if="initial.mode !== 'move'" class="pivot-create__section">
        <h3>{{ t("pivot.chooseSource") }}</h3>
        <RadioGroup v-model="draft.sourceKind" class="pivot-create__sources" :disabled="disabled">
          <div class="pivot-create__source">
            <Radio value="range">{{ t("pivot.cellRange") }}</Radio>
            <RangeReferenceInput
              v-if="draft.sourceKind === 'range'"
              v-model="draft.source"
              :label="t('chart.source')"
              :select-reference="selectReference"
              :disabled="disabled"
            />
          </div>
          <div class="pivot-create__source">
            <Radio value="consolidation">{{ t("pivot.consolidationRanges") }}</Radio>
            <PivotConsolidationRanges
              v-if="draft.sourceKind === 'consolidation'"
              v-model="draft.sources"
              :workbook="workbook"
              :reference-sheet-id="draft.referenceSheetId"
              :initial-reference="draft.source"
              :disabled="disabled"
              :select-reference="selectReference"
            />
          </div>
          <div class="pivot-create__source">
            <Radio value="pivot">{{ t("pivot.anotherPivot") }}</Radio>
            <template v-if="draft.sourceKind === 'pivot'">
              <div class="pivot-create__reports">
                <OptionList
                  :model-value="selectedPivot"
                  :options="pivotOptions"
                  :label="t('pivot.anotherPivot')"
                  :inert="disabled || undefined"
                  overflow="ellipsis"
                  @select="selectPivot"
                >
                  <template #empty
                    ><p>{{ t("pivot.noReports") }}</p></template
                  >
                </OptionList>
              </div>
              <p>{{ t("pivot.reuseHint") }}</p>
            </template>
          </div>
        </RadioGroup>
      </section>
      <section v-if="initial.mode !== 'source'" class="pivot-create__section">
        <h3>{{ t("pivot.chooseDestination") }}</h3>
        <RadioGroup
          v-if="!initial.existing"
          :value="draft.newSheet ? 'new' : 'existing'"
          class="pivot-create__locations"
          :disabled="disabled"
          @change="draft.newSheet = $event === 'new'"
        >
          <Radio value="new">{{ t("pivot.newSheet") }}</Radio>
          <Radio value="existing">{{ t("pivot.existingSheet") }}</Radio>
        </RadioGroup>
        <p v-else>{{ t("pivot.moveHint") }}</p>
        <RangeReferenceInput
          v-if="!draft.newSheet"
          v-model="draft.destination"
          :label="t('pivot.destination')"
          :select-reference="selectReference"
          :disabled="disabled"
        />
      </section>
      <Checkbox
        v-if="error && (!errorReason || errorReason === 'overwrite') && !draft.newSheet"
        v-model="draft.overwrite"
        :disabled="disabled"
        >{{ t("pivot.overwrite") }}</Checkbox
      >
      <p v-if="error || !validSource" role="alert">
        {{
          t(
            error && errorReason && errorReason !== "invalid"
              ? `pivot.error.${errorReason}`
              : "pivot.invalid",
          )
        }}
      </p>
    </div>
  </Dialog>
</template>
<style scoped lang="scss">
.pivot-create {
  display: grid;
  gap: 24px;
  &__sources,
  &__source {
    display: grid;
    gap: 10px;
  }
  &__sources {
    width: 100%;
  }
  &__source > :not(:first-child) {
    margin-left: 20px;
  }
  &__reports {
    display: grid;
    height: 112px;
    p {
      padding: 8px;
    }
  }
  &__section {
    display: grid;
    gap: 12px;
  }
  &__locations {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }
  h3 {
    margin: 0;
    font-size: var(--idea-font-size-body-medium);
    font-weight: 600;
  }
  p {
    margin: 0;
    color: var(--idea-text-secondary);
  }
  [role="alert"] {
    color: var(--idea-status-error);
  }
}
</style>
