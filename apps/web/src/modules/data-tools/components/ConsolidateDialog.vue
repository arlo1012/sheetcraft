<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import RangeReferenceInput from "../../../shared/range-reference/RangeReferenceInput.vue";
import { useAppI18n } from "../../../shared/i18n";
import type { ConsolidateDraft, ConsolidatePreview } from "../consolidate-types";

const props = withDefaults(
  defineProps<{
    visible: boolean;
    initial: ConsolidateDraft;
    error?: string;
    preview?: ConsolidatePreview;
    busy?: boolean;
    picking?: boolean;
  }>(),
  { error: "", preview: undefined, busy: false, picking: false },
);
const emit = defineEmits<{
  apply: [draft: ConsolidateDraft];
  close: [];
  draftChange: [draft: ConsolidateDraft];
  pickRange: [field: "sources" | "destination", sourceIndex?: number];
}>();
const { t } = useAppI18n();
const copyDraft = (draft: ConsolidateDraft): ConsolidateDraft => ({
  ...draft,
  sources: [...draft.sources],
});
const draft = ref(copyDraft(props.initial));
const canApply = computed(() =>
  Boolean(draft.value.destination.trim() && draft.value.sources.every((source) => source.trim())),
);
const functions = computed(() => [
  { value: "sum", label: t("dataTools.consolidate.sum") },
  { value: "count", label: t("dataTools.consolidate.count") },
  { value: "average", label: t("dataTools.consolidate.average") },
  { value: "min", label: t("dataTools.consolidate.min") },
  { value: "max", label: t("dataTools.consolidate.max") },
]);
function addSource(): void {
  draft.value.sources.push("");
}
function setSource(index: number, value: string): void {
  draft.value.sources[index] = value;
}
function removeSource(index: number): void {
  if (draft.value.sources.length > 1) draft.value.sources.splice(index, 1);
}
watch(
  () => props.visible,
  (visible) => {
    if (visible && !props.picking) draft.value = copyDraft(props.initial);
  },
);
watch(
  () => props.initial,
  (initial) => {
    if (props.visible && !props.picking) draft.value = copyDraft(initial);
  },
  { deep: true },
);
watch(
  draft,
  (value) => {
    if (JSON.stringify(value) !== JSON.stringify(props.initial))
      emit("draftChange", copyDraft(value));
  },
  { deep: true },
);
</script>

<template>
  <Dialog
    role="dialog"
    aria-modal="true"
    :aria-label="t('dataTools.consolidate.title')"
    width="min(520px, calc(100vw - 32px))"
    :visible="visible && !picking"
    :header="t('dataTools.consolidate.title')"
    :confirm-btn="{ content: t('dataTools.consolidate.apply'), disabled: busy || !canApply }"
    :cancel-btn="t('dataTools.common.cancel')"
    :close-btn="!busy"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    @close="emit('close')"
    @confirm="!busy && canApply && emit('apply', copyDraft(draft))"
  >
    <div class="consolidate-dialog">
      <section class="consolidate-dialog__sources">
        <div class="consolidate-dialog__section-heading">
          <span>{{ t("dataTools.consolidate.sources") }}</span>
          <TButton variant="text" size="small" :disabled="busy" @click="addSource">
            {{ t("dataTools.consolidate.addSource") }}
          </TButton>
        </div>
        <div
          v-for="(_source, index) in draft.sources"
          :key="index"
          class="consolidate-dialog__source"
        >
          <RangeReferenceInput
            :model-value="draft.sources[index] ?? ''"
            @update:model-value="setSource(index, $event)"
            :disabled="busy"
            :label="`${t('dataTools.consolidate.sourceRange')} ${index + 1}`"
            :pick-label="t('dataTools.consolidate.pickRange')"
            placeholder="A1:C10"
            :select-reference="
              async () => {
                emit('pickRange', 'sources', index);
                return undefined;
              }
            "
          />
          <TButton
            variant="text"
            size="small"
            :disabled="busy || draft.sources.length === 1"
            @click="removeSource(index)"
          >
            {{ t("dataTools.consolidate.removeSource") }}
          </TButton>
        </div>
      </section>
      <label class="consolidate-dialog__field">
        <span>{{ t("dataTools.consolidate.destination") }}</span>
        <RangeReferenceInput
          v-model="draft.destination"
          :disabled="busy"
          :label="t('dataTools.consolidate.destination')"
          :pick-label="t('dataTools.consolidate.pickRange')"
          placeholder="E1"
          :select-reference="
            async () => {
              emit('pickRange', 'destination');
              return undefined;
            }
          "
        />
      </label>
      <label class="consolidate-dialog__field">
        <span>{{ t("dataTools.consolidate.function") }}</span>
        <TSelect v-model="draft.function" :disabled="busy" :options="functions" />
      </label>
      <div class="consolidate-dialog__checks">
        <TCheckbox v-model="draft.topRow" :disabled="busy">{{
          t("dataTools.consolidate.topRow")
        }}</TCheckbox>
        <TCheckbox v-model="draft.leftColumn" :disabled="busy">{{
          t("dataTools.consolidate.leftColumn")
        }}</TCheckbox>
        <TCheckbox v-model="draft.overwrite" :disabled="busy">{{
          t("dataTools.consolidate.overwrite")
        }}</TCheckbox>
      </div>
      <div v-if="preview" class="consolidate-dialog__preview">
        <p>
          {{ t("dataTools.consolidate.preview", { rows: preview.rows, columns: preview.columns }) }}
        </p>
        <p>
          {{
            t("dataTools.consolidate.previewCounts", {
              sourceCells: preview.sourceCells,
              outputCells: preview.outputCells,
              numericValues: preview.numericValues,
            })
          }}
        </p>
        <div v-if="preview.sample.length" class="consolidate-dialog__sample">
          <div
            v-for="(row, rowIndex) in preview.sample"
            :key="rowIndex"
            class="consolidate-dialog__sample-row"
            :style="{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }"
          >
            <span v-for="(value, columnIndex) in row" :key="columnIndex">{{ value }}</span>
          </div>
        </div>
      </div>
      <p v-if="error" class="consolidate-dialog__error" role="alert">{{ error }}</p>
    </div>
  </Dialog>
</template>

<style scoped lang="scss">
.consolidate-dialog {
  display: grid;
  gap: var(--idea-space-3);
  &__sources,
  &__checks {
    display: grid;
    gap: var(--idea-space-2);
  }
  &__section-heading,
  &__source {
    display: flex;
    align-items: center;
    gap: var(--idea-space-2);
  }
  &__section-heading {
    justify-content: space-between;
    font-weight: 500;
  }
  &__source > :first-child {
    flex: 1;
    min-width: 0;
  }
  &__field {
    display: grid;
    grid-template-columns: 84px minmax(0, 1fr);
    align-items: center;
    gap: var(--idea-space-2);
  }
  &__preview {
    display: grid;
    gap: var(--idea-space-1);
    color: var(--idea-text-secondary);
    font-size: var(--idea-font-size-body-small);
  }
  &__preview p,
  &__error {
    margin: 0;
  }
  &__sample {
    border: 1px solid var(--idea-border-subtle);
  }
  &__sample-row {
    display: grid;
  }
  &__sample span {
    overflow: hidden;
    padding: var(--idea-space-1);
    text-overflow: ellipsis;
    white-space: nowrap;
    border-right: 1px solid var(--idea-border-subtle);
  }
  &__error {
    color: var(--idea-status-error);
  }
}
</style>
