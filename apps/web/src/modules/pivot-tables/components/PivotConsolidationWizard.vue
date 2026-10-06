<script setup lang="ts">
import { computed, ref } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Button } from "tdesign-vue-next/es/button";
import { Radio, RadioGroup } from "tdesign-vue-next/es/radio";
import { getPivotTableSource, normalizePivotTable } from "@idea10/core/pivot-tables";
import type { Workbook } from "@idea10/core/workbook";
import type { PivotDraft } from "../usePivotActions";
import { resolvePivotDraftSource } from "../pivot-draft-source";
import { useAppI18n } from "../../../shared/i18n";
import PivotConsolidationRanges from "./PivotConsolidationRanges.vue";

const props = defineProps<{
  initial: PivotDraft;
  workbook: Workbook;
  revision: number;
  disabled: boolean;
  suspended: boolean;
  selectReference: (current: string) => Promise<string | undefined>;
}>();
const emit = defineEmits<{ confirm: [draft: PivotDraft]; close: [] }>();
const { t } = useAppI18n();
const draft = ref<PivotDraft>(JSON.parse(JSON.stringify(props.initial)) as PivotDraft);
draft.value.sourceKind = "consolidation";
draft.value.consolidationPageItems = draft.value.sources.map((_, index) =>
  Array.from({ length: 4 }, (_, field) => draft.value.consolidationPageItems[index]?.[field] ?? ""),
);
const step = ref(1);
const pendingPageItems = ref(["", "", "", ""]);
const canFinish = computed(() => {
  void props.revision;
  try {
    const source = resolvePivotDraftSource(props.workbook, draft.value);
    getPivotTableSource(
      props.workbook,
      normalizePivotTable({
        ...draft.value.table,
        ...source,
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
function finish(): void {
  if (!props.disabled && canFinish.value) emit("confirm", draft.value);
}
</script>
<template>
  <Dialog
    :visible="!suspended"
    :header="t('pivot.wizardTitle', { step })"
    width="min(500px, calc(100vw - 32px))"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    @close="emit('close')"
  >
    <div class="pivot-consolidation-wizard" :data-pivot-wizard-step="step">
      <template v-if="step === 1">
        <p>{{ t("pivot.wizardHint") }}</p>
        <strong>{{ t("pivot.pageFieldsPrompt") }}</strong>
        <RadioGroup
          v-model="draft.consolidationPageMode"
          :disabled="disabled"
          class="pivot-consolidation-wizard__modes"
        >
          <Radio value="single">{{ t("pivot.singlePageField") }}</Radio>
          <Radio value="custom">{{ t("pivot.customPageFields") }}</Radio>
        </RadioGroup>
      </template>
      <template v-else>
        <PivotConsolidationRanges
          v-model="draft.sources"
          v-model:page-items="draft.consolidationPageItems"
          v-model:pending-page-items="pendingPageItems"
          :workbook="workbook"
          :reference-sheet-id="draft.referenceSheetId"
          :initial-reference="draft.source"
          :page-count="draft.consolidationPageMode === 'custom' ? draft.consolidationPageCount : 0"
          :disabled="disabled"
          :select-reference="selectReference"
        >
          <template #page-count>
            <div
              v-if="draft.consolidationPageMode === 'custom'"
              class="pivot-consolidation-wizard__count"
            >
              <strong>{{ t("pivot.pageFieldsCount") }}</strong>
              <RadioGroup v-model="draft.consolidationPageCount" :disabled="disabled">
                <Radio v-for="count in [0, 1, 2, 3, 4]" :key="count" :value="count">{{
                  count
                }}</Radio>
              </RadioGroup>
            </div>
          </template>
        </PivotConsolidationRanges>
      </template>
    </div>
    <template #footer>
      <div class="pivot-consolidation-wizard__footer">
        <Button variant="outline" @click="emit('close')">{{ t("picture.cancel") }}</Button>
        <Button variant="outline" :disabled="disabled || step === 1" @click="step = 1">{{
          t("pivot.previousStep")
        }}</Button>
        <Button
          :theme="step === 1 ? 'primary' : 'default'"
          :variant="step === 1 ? 'base' : 'outline'"
          :disabled="disabled || step === 2"
          @click="step = 2"
          >{{ t("pivot.nextStep") }}</Button
        >
        <Button
          :theme="step === 2 ? 'primary' : 'default'"
          :variant="step === 2 ? 'base' : 'outline'"
          :disabled="disabled || !canFinish"
          @click="finish"
          >{{ t("pivot.finish") }}</Button
        >
      </div>
    </template>
  </Dialog>
</template>
<style scoped lang="scss">
.pivot-consolidation-wizard {
  display: grid;
  gap: 16px;
  p {
    margin: 0;
  }
  &__modes {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }
  &__count {
    display: grid;
    gap: 8px;
  }
  &__footer {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
  }
}
</style>
