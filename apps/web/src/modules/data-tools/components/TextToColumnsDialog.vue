<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { Radio as TRadio, RadioGroup as TRadioGroup } from "tdesign-vue-next/es/radio";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { useAppI18n } from "../../../shared/i18n";
import type { TextToColumnsDraft } from "../data-tools-types";

const props = withDefaults(
  defineProps<{ visible: boolean; preview?: readonly string[]; destinationLabel?: string }>(),
  { preview: () => [], destinationLabel: "" },
);
const emit = defineEmits<{
  close: [];
  apply: [draft: TextToColumnsDraft];
  draftChange: [draft: TextToColumnsDraft];
}>();
const { t } = useAppI18n();
const draft = ref<TextToColumnsDraft>({
  mode: "delimiter",
  delimiters: [","],
  otherDelimiter: "",
  fixedWidths: [],
  columnTypes: [],
  destination: "",
  overwrite: false,
});
watch(
  () => props.visible,
  (visible) => {
    if (visible)
      draft.value = {
        mode: "delimiter",
        delimiters: [","],
        otherDelimiter: "",
        fixedWidths: [],
        columnTypes: props.preview.map(() => "general"),
        destination: props.destinationLabel,
        overwrite: false,
      };
  },
);
watch(
  draft,
  (value) =>
    emit("draftChange", {
      ...value,
      delimiters: [...value.delimiters],
      fixedWidths: [...value.fixedWidths],
      columnTypes: [...value.columnTypes],
    }),
  { deep: true },
);
const delimiterOptions = computed(() => [
  { value: ",", label: t("dataTools.textToColumns.comma") },
  { value: ";", label: t("dataTools.textToColumns.semicolon") },
  { value: "\t", label: t("dataTools.textToColumns.tab") },
  { value: " ", label: t("dataTools.textToColumns.space") },
]);
const columnTypeOptions = computed(() => [
  { value: "general", label: t("cellFormat.general") },
  { value: "text", label: t("ribbon.textFormat") },
]);
watch(
  () => props.preview.length,
  (length) => {
    if (draft.value.columnTypes.length === length) return;
    draft.value.columnTypes = Array.from(
      { length },
      (_, index) => draft.value.columnTypes[index] ?? "general",
    );
  },
  { immediate: true },
);
function toggleDelimiter(delimiter: string, checked: boolean): void {
  draft.value.delimiters = checked
    ? [...new Set([...draft.value.delimiters, delimiter])]
    : draft.value.delimiters.filter((item) => item !== delimiter);
}
function setWidths(value: string | number): void {
  draft.value.fixedWidths = String(value)
    .split(",")
    .map(Number)
    .filter((width) => Number.isInteger(width) && width > 0);
}
function setColumnType(index: number, value: unknown): void {
  draft.value.columnTypes[index] = value === "text" ? "text" : "general";
}
</script>
<template>
  <Dialog
    role="dialog"
    aria-modal="true"
    :aria-label="t('dataTools.textToColumns.title')"
    :visible="visible"
    :header="t('dataTools.textToColumns.title')"
    :confirm-btn="t('dataTools.textToColumns.confirm')"
    :cancel-btn="t('dataTools.common.cancel')"
    @close="emit('close')"
    @confirm="emit('apply', draft)"
  >
    <div class="text-to-columns-dialog">
      <TRadioGroup v-model="draft.mode"
        ><TRadio value="delimiter">{{ t("dataTools.textToColumns.delimiter") }}</TRadio
        ><TRadio value="fixed-width">{{
          t("dataTools.textToColumns.fixedWidth")
        }}</TRadio></TRadioGroup
      >
      <template v-if="draft.mode === 'delimiter'"
        ><label v-for="item in delimiterOptions" :key="item.value"
          ><TCheckbox
            :checked="draft.delimiters.includes(item.value)"
            @change="toggleDelimiter(item.value, Boolean($event))"
          />{{ item.label }}</label
        ><label
          >{{ t("dataTools.textToColumns.other") }}<TInput v-model="draft.otherDelimiter" /></label
      ></template>
      <label v-else
        >{{ t("dataTools.textToColumns.fixedWidth")
        }}<TInput :value="draft.fixedWidths.join(',')" @change="setWidths($event)"
      /></label>
      <label
        >{{ t("dataTools.textToColumns.destination") }}<TInput v-model="draft.destination"
      /></label>
      <label
        ><TCheckbox v-model="draft.overwrite" />{{ t("dataTools.textToColumns.overwrite") }}</label
      >
      <div
        v-if="preview.length"
        class="text-to-columns-dialog__preview"
        :aria-label="t('dataTools.textToColumns.preview')"
      >
        <strong>{{ t("dataTools.textToColumns.preview") }}</strong>
        <div
          v-for="(value, index) in preview"
          :key="index"
          class="text-to-columns-dialog__preview-column"
        >
          <span class="text-to-columns-dialog__preview-value">{{ value }}</span
          ><TSelect
            :value="draft.columnTypes[index] ?? 'general'"
            :options="columnTypeOptions"
            :aria-label="t('dataTools.textToColumns.preview')"
            :data-text-to-columns-column-type="index"
            @change="setColumnType(index, $event)"
          />
        </div>
      </div>
    </div>
  </Dialog>
</template>
<style scoped lang="scss">
.text-to-columns-dialog {
  display: grid;
  gap: var(--idea-space-3);
  min-width: min(440px, calc(100vw - 64px));
  label {
    display: grid;
    gap: var(--idea-space-1);
  }
  &__preview {
    display: flex;
    gap: var(--idea-space-2);
    flex-wrap: wrap;
    padding: var(--idea-space-2);
    background: var(--idea-surface-muted);
    &-column {
      display: grid;
      gap: var(--idea-space-1);
      min-width: 120px;
    }
    &-value {
      padding: 2px 6px;
      border: 1px solid var(--idea-border);
    }
  }
}
</style>
