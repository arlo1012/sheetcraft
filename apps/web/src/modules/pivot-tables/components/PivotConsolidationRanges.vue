<script setup lang="ts">
import { computed, ref } from "vue";
import { Input } from "tdesign-vue-next/es/input";
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
  pageCount: number;
  selectReference: (current: string) => Promise<string | undefined>;
}>();
const sources = defineModel<string[]>({ required: true });
const pageItems = defineModel<string[][]>("pageItems", { required: true });
const pendingPageItems = defineModel<string[]>("pendingPageItems", { required: true });
defineSlots<{ "page-count"?: () => unknown }>();
const { t } = useAppI18n();
const reference = ref(props.initialReference);
const selected = ref<string | undefined>(sources.value.length ? "0" : undefined);
const selectedItems = computed(() =>
  selected.value === undefined ? pendingPageItems.value : pageItems.value[Number(selected.value)],
);
async function browse(): Promise<void> {
  if (props.disabled) return;
  const picked = await props.selectReference(reference.value);
  if (picked !== undefined) reference.value = picked;
}
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
  pageItems.value = [
    ...pageItems.value,
    selected.value === undefined ? [...pendingPageItems.value] : ["", "", "", ""],
  ];
  selected.value = String(nextSources.length - 1);
}
function remove(): void {
  if (props.disabled || selected.value === undefined) return;
  const index = Number(selected.value);
  const nextSources = sources.value.filter((_, at) => at !== index);
  if (!nextSources.length) pendingPageItems.value = [...(selectedItems.value ?? ["", "", "", ""])];
  sources.value = nextSources;
  pageItems.value = pageItems.value.filter((_, at) => at !== index);
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
    <section class="pivot-consolidation-ranges__source">
      <p>{{ t("pivot.wizardRangesHint") }}</p>
      <strong>{{ t("pivot.sourceRange") }}</strong>
      <RangeReferenceInput
        v-model="reference"
        :label="t('pivot.sourceRange')"
        :disabled="disabled"
        :select-reference="selectReference"
        @enter="add"
      />
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
        <Button size="small" variant="outline" :disabled="disabled" @click="browse">{{
          t("pivot.browse")
        }}</Button>
      </div>
    </section>
    <section class="pivot-consolidation-ranges__areas">
      <strong>{{ t("pivot.allRanges") }}</strong>
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
    </section>
    <slot name="page-count" />
    <section v-if="pageCount" class="pivot-consolidation-ranges__page-items">
      <p>{{ t("pivot.pageItemsHint") }}</p>
      <div class="pivot-consolidation-ranges__page-grid">
        <label v-for="field in pageCount" :key="field"
          >{{ t("pivot.pageField", { index: field }) }}
          <Input
            v-if="selectedItems"
            v-model="selectedItems[field - 1]"
            :disabled="disabled"
            :maxlength="200"
            :aria-label="t('pivot.pageField', { index: field })"
          />
          <Input v-else :disabled="true" />
        </label>
      </div>
    </section>
  </div>
</template>
<style scoped lang="scss">
.pivot-consolidation-ranges {
  display: grid;
  gap: 16px;
  min-width: 0;
  p {
    margin: 0;
    color: var(--idea-text-secondary);
  }
  &__source,
  &__areas,
  &__page-items {
    display: grid;
    gap: 8px;
    min-width: 0;
  }
  &__actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  &__page-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px 16px;
    label {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      align-items: center;
      gap: 8px;
    }
  }
  &__list {
    display: grid;
    height: 128px;
    min-height: 0;
    p {
      padding: 8px;
    }
  }
  @media (max-width: 420px) {
    &__page-grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }
}
</style>
