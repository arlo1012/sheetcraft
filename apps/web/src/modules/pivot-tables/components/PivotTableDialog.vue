<script setup lang="ts">
import { computed, ref } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Radio, RadioGroup } from "tdesign-vue-next/es/radio";
import { Button } from "tdesign-vue-next/es/button";
import { getPivotTableSource, normalizePivotTable } from "@idea10/core/pivot-tables";
import type { Workbook } from "@idea10/core/workbook";
import type { PivotDraft } from "../usePivotActions";
import { useAppI18n } from "../../../shared/i18n";
import RangeReferenceInput from "../../../shared/range-reference/RangeReferenceInput.vue";
import OptionList from "../../../shared/option-list/OptionList.vue";
import PivotConsolidationWizard from "./PivotConsolidationWizard.vue";
import PivotCreateFeedback from "./PivotCreateFeedback.vue";
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
const wizardOpen = ref(false);
function completeRanges(value: PivotDraft): void {
  if (props.disabled) return;
  draft.value.sources = value.sources;
  draft.value.consolidationPageMode = value.consolidationPageMode;
  draft.value.consolidationPageCount = value.consolidationPageCount;
  draft.value.consolidationPageItems = value.consolidationPageItems;
  emit("confirm", draft.value);
}
function selectExistingDestination(): void {
  if (!props.disabled) draft.value.newSheet = false;
}
async function selectDestinationReference(current: string): Promise<string | undefined> {
  if (props.disabled) return undefined;
  selectExistingDestination();
  return props.selectReference(current);
}
const validSource = computed(() => {
  void props.revision;
  try {
    getPivotTableSource(
      props.workbook,
      normalizePivotTable({
        ...draft.value.table,
        ...resolvePivotDraftSource(props.workbook, draft.value),
        dataCache: undefined,
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
    :visible="!suspended && !wizardOpen"
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
            <div v-if="draft.sourceKind === 'consolidation'" class="pivot-create__consolidation">
              <RadioGroup
                v-model="draft.consolidationPageMode"
                :disabled="disabled"
                :aria-label="t('pivot.pageFieldsPrompt')"
                class="pivot-create__page-modes"
              >
                <Radio value="single">{{ t("pivot.singlePageField") }}</Radio>
                <Radio value="custom">{{ t("pivot.customPageFields") }}</Radio>
              </RadioGroup>
              <div class="pivot-create__range-summary">
                <Button
                  size="small"
                  variant="outline"
                  :disabled="disabled"
                  @click="wizardOpen = true"
                  >{{ t("pivot.selectRanges") }}</Button
                >
                <span>{{
                  draft.sources.length
                    ? t("pivot.selectedRanges", { count: draft.sources.length })
                    : t("pivot.noRangesSelected")
                }}</span>
              </div>
            </div>
          </div>
          <div class="pivot-create__source">
            <Radio value="pivot">{{ t("pivot.anotherPivot") }}</Radio>
            <template v-if="draft.sourceKind === 'pivot'">
              <div v-if="pivotOptions.length" class="pivot-create__reports">
                <OptionList
                  :model-value="selectedPivot"
                  :options="pivotOptions"
                  :label="t('pivot.anotherPivot')"
                  :inert="disabled || undefined"
                  overflow="ellipsis"
                  @select="selectPivot"
                />
              </div>
              <p v-else>{{ t("pivot.noReports") }}</p>
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
        <div
          class="pivot-create__destination"
          @pointerdown.capture="selectExistingDestination"
          @focusin="selectExistingDestination"
        >
          <RangeReferenceInput
            v-model="draft.destination"
            :label="t('pivot.destination')"
            :select-reference="selectDestinationReference"
            :disabled="disabled"
            @update:model-value="selectExistingDestination"
          />
        </div>
      </section>
      <PivotCreateFeedback
        v-model="draft.overwrite"
        :error="error"
        :error-reason="errorReason"
        :new-sheet="draft.newSheet"
        :disabled="disabled"
      />
    </div>
  </Dialog>
  <PivotConsolidationWizard
    v-if="wizardOpen"
    :initial="draft"
    :workbook="workbook"
    :revision="revision"
    :disabled="disabled"
    :suspended="suspended"
    :select-reference="selectReference"
    @confirm="completeRanges"
    @close="wizardOpen = false"
  >
    <template #feedback>
      <PivotCreateFeedback
        v-model="draft.overwrite"
        :error="error"
        :error-reason="errorReason"
        :new-sheet="draft.newSheet"
        :disabled="disabled"
      />
    </template>
  </PivotConsolidationWizard>
</template>
<style scoped lang="scss">
.pivot-create {
  display: grid;
  gap: 16px;
  &__sources,
  &__source,
  &__consolidation {
    display: grid;
    gap: 8px;
  }
  &__sources {
    width: 100%;
  }
  &__source > :not(:first-child) {
    margin-left: 20px;
  }
  &__range-summary {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--idea-text-secondary);
  }
  &__reports {
    display: grid;
    max-height: 112px;
    min-height: 0;
  }
  &__section {
    display: grid;
    gap: 10px;
  }
  &__destination {
    margin-left: 20px;
  }
  &__locations,
  &__page-modes {
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
}
</style>
