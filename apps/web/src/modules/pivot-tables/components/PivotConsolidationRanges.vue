<script setup lang="ts">
import { computed, ref } from "vue";
import { Button } from "tdesign-vue-next/es/button";
import { rangesIntersect } from "@idea10/core/pivot-tables";
import type { Workbook } from "@idea10/core/workbook";
import { useAppI18n } from "../../../shared/i18n";
import OptionList from "../../../shared/option-list/OptionList.vue";
import RangeReferenceInput from "../../../shared/range-reference/RangeReferenceInput.vue";
import {
  formatRangeReference,
  resolveRangeReference,
} from "../../../shared/range-reference/formatRangeReference";

const props = defineProps<{
  workbook: Workbook;
  referenceSheetId: string;
  initialReference: string;
  disabled: boolean;
  selectReference: (current: string) => Promise<string | undefined>;
}>();
const sources = defineModel<string[]>({ required: true });
const { t } = useAppI18n();
const reference = ref(props.initialReference);
const selected = ref<string>();
const options = computed(() =>
  sources.value.map((label, index) => ({ value: String(index), label })),
);
const area = computed(() =>
  resolveRangeReference(props.workbook, reference.value, props.referenceSheetId),
);
const canAdd = computed(() => {
  const next = area.value;
  return (
    !!next &&
    sources.value.length < 128 &&
    next.range.end.row > next.range.start.row &&
    next.range.end.column > next.range.start.column &&
    !sources.value.some((source) => {
      const existing = resolveRangeReference(props.workbook, source, props.referenceSheetId);
      return existing?.sheetId === next.sheetId && rangesIntersect(existing.range, next.range);
    })
  );
});
function add(): void {
  if (props.disabled || !canAdd.value || !area.value) return;
  const next = area.value;
  const nextSources = [
    ...sources.value,
    formatRangeReference(props.workbook.sheets.get(next.sheetId)!.name, next.range),
  ];
  sources.value = nextSources;
  selected.value = String(nextSources.length - 1);
}
function remove(): void {
  if (props.disabled || selected.value === undefined) return;
  const index = Number(selected.value);
  const nextSources = sources.value.filter((_, at) => at !== index);
  sources.value = nextSources;
  selected.value = nextSources.length ? String(Math.min(index, nextSources.length - 1)) : undefined;
}
function select(value: string): void {
  if (props.disabled) return;
  selected.value = value;
  reference.value = sources.value[Number(value)] ?? "";
}
</script>
<template>
  <div class="pivot-consolidation-ranges">
    <p>{{ t("pivot.consolidationHint") }}</p>
    <RangeReferenceInput
      v-model="reference"
      :label="t('pivot.sourceRange')"
      :disabled="disabled"
      :select-reference="selectReference"
      @enter="add"
    />
    <div class="pivot-consolidation-ranges__heading">
      <span>{{ t("pivot.selectedRanges", { count: sources.length }) }}</span>
      <div class="pivot-consolidation-ranges__actions">
        <Button size="small" variant="outline" :disabled="disabled || !canAdd" @click="add">{{
          t("pivot.addRange")
        }}</Button>
        <Button
          size="small"
          variant="outline"
          :disabled="disabled || selected === undefined"
          @click="remove"
          >{{ t("pivot.remove") }}</Button
        >
      </div>
    </div>
    <div class="pivot-consolidation-ranges__list">
      <OptionList
        :model-value="selected"
        :options="options"
        :label="t('pivot.consolidationRanges')"
        :inert="disabled || undefined"
        overflow="ellipsis"
        @select="select"
        @keydown.delete.stop.prevent="remove"
      >
        <template #empty
          ><p>{{ t("pivot.noRanges") }}</p></template
        >
      </OptionList>
    </div>
  </div>
</template>
<style scoped lang="scss">
.pivot-consolidation-ranges {
  display: grid;
  gap: 8px;
  p {
    margin: 0;
    color: var(--idea-text-secondary);
  }
  &__heading,
  &__actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  &__heading {
    justify-content: space-between;
  }
  &__list {
    display: grid;
    height: 112px;
    p {
      padding: 8px;
    }
  }
}
</style>
