<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { useAppI18n } from "../../../shared/i18n";
import type { DataToolColumn, SortDraft } from "../data-tools-types";

const props = withDefaults(
  defineProps<{
    visible: boolean;
    columns: readonly DataToolColumn[];
    rangeLabel?: string;
    initial?: { hasHeader: boolean; column: number; direction: "ascending" | "descending" };
  }>(),
  { rangeLabel: "", initial: undefined },
);
const emit = defineEmits<{ close: []; apply: [draft: SortDraft] }>();
const { t } = useAppI18n();
const draft = ref<SortDraft>({ range: "", hasHeader: true, levels: [] });
const columnOptions = computed(() =>
  props.columns.map((column) => ({
    label: column.header ? `${column.label} (${column.header})` : column.label,
    value: column.column,
  })),
);
const directionOptions = computed(() => [
  { label: t("dataTools.sort.ascending"), value: "ascending" },
  { label: t("dataTools.sort.descending"), value: "descending" },
]);
watch(
  () => props.visible,
  (visible) => {
    if (visible)
      draft.value = {
        range: props.rangeLabel,
        hasHeader: props.initial?.hasHeader ?? true,
        levels: [
          {
            column: props.initial?.column ?? props.columns[0]?.column ?? 0,
            direction: props.initial?.direction ?? "ascending",
          },
        ],
      };
  },
);
function addLevel(): void {
  const column = props.columns.find(
    (item) => !draft.value.levels.some((level) => level.column === item.column),
  );
  if (!column) return;
  draft.value.levels = [...draft.value.levels, { column: column.column, direction: "ascending" }];
}
function removeLevel(index: number): void {
  if (draft.value.levels.length > 1)
    draft.value.levels = draft.value.levels.filter((_, item) => item !== index);
}
function apply(): void {
  emit("apply", { ...draft.value, levels: draft.value.levels.map((level) => ({ ...level })) });
}
</script>

<template>
  <Dialog
    role="dialog"
    aria-modal="true"
    :aria-label="t('dataTools.sort.title')"
    :visible="visible"
    :header="t('dataTools.sort.title')"
    :confirm-btn="t('dataTools.sort.confirm')"
    :cancel-btn="t('dataTools.common.cancel')"
    @close="emit('close')"
    @confirm="apply"
  >
    <div class="sort-dialog">
      <label>{{ t("dataTools.sort.range") }}<TInput :value="draft.range" readonly /></label>
      <label><TCheckbox v-model="draft.hasHeader" />{{ t("dataTools.sort.header") }}</label>
      <div v-for="(level, index) in draft.levels" :key="index" class="sort-dialog__level">
        <TSelect
          v-model="level.column"
          :options="columnOptions"
          :aria-label="t('dataTools.sort.column')"
        />
        <TSelect
          v-model="level.direction"
          :options="directionOptions"
          :aria-label="t('dataTools.sort.order')"
        />
        <TButton variant="text" :disabled="draft.levels.length === 1" @click="removeLevel(index)">{{
          t("dataTools.sort.deleteLevel")
        }}</TButton>
      </div>
      <TButton
        variant="outline"
        :disabled="draft.levels.length >= columns.length"
        @click="addLevel"
        >{{ t("dataTools.sort.addLevel") }}</TButton
      >
    </div>
  </Dialog>
</template>

<style scoped lang="scss">
.sort-dialog {
  display: grid;
  gap: var(--idea-space-3);
  min-width: min(440px, calc(100vw - 64px));
  label {
    display: grid;
    gap: var(--idea-space-1);
  }
  &__level {
    display: grid;
    grid-template-columns: 1fr 1fr auto;
    gap: var(--idea-space-2);
  }
}
</style>
