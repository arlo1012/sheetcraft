<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { Dialog } from "tdesign-vue-next/es/dialog";
import OptionList from "../../../shared/option-list/OptionList.vue";
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
    selectSourceReference?: (current: string) => Promise<string | undefined>;
  }>(),
  { error: "", preview: undefined, busy: false, picking: false },
);
const emit = defineEmits<{
  apply: [draft: ConsolidateDraft];
  close: [];
  draftChange: [draft: ConsolidateDraft];
  pickRange: [field: "destination"];
}>();
const { t } = useAppI18n();
const copyDraft = (value: ConsolidateDraft): ConsolidateDraft => ({
  ...value,
  sources: [...value.sources],
});
const draft = ref(copyDraft(props.initial));
const reference = ref(props.initial.sources[0] ?? "");
const selectedIndex = ref(props.initial.sources.length ? 0 : -1);
const sourceOptions = computed(() =>
  draft.value.sources.map((label, index) => ({ value: String(index), label })),
);
const canApply = computed(() =>
  Boolean(
    draft.value.destination.trim() &&
    draft.value.sources.length &&
    draft.value.sources.every((source) => source.trim()),
  ),
);
const canAdd = computed(() => Boolean(reference.value.trim()));
const functions = computed(
  () =>
    [
      { value: "sum", label: t("dataTools.consolidate.sum") },
      { value: "counta", label: t("dataTools.consolidate.counta") },
      { value: "average", label: t("dataTools.consolidate.average") },
      { value: "max", label: t("dataTools.consolidate.max") },
      { value: "min", label: t("dataTools.consolidate.min") },
      { value: "product", label: t("dataTools.consolidate.product") },
      { value: "count", label: t("dataTools.consolidate.count") },
      { value: "stdev", label: t("dataTools.consolidate.stdev") },
      { value: "stdevp", label: t("dataTools.consolidate.stdevp") },
      { value: "var", label: t("dataTools.consolidate.var") },
      { value: "varp", label: t("dataTools.consolidate.varp") },
    ] as const,
);
function selectSource(index: number): void {
  selectedIndex.value = index;
  reference.value = draft.value.sources[index] ?? "";
}
function addSource(): void {
  if (props.busy || !canAdd.value) return;
  const value = reference.value.trim();
  const existing = draft.value.sources.findIndex(
    (source) => source.replace(/^=/, "") === value.replace(/^=/, ""),
  );
  if (existing >= 0) {
    selectSource(existing);
    return;
  }
  draft.value.sources.push(value);
  selectSource(draft.value.sources.length - 1);
}
function removeSource(): void {
  if (props.busy || selectedIndex.value < 0) return;
  draft.value.sources.splice(selectedIndex.value, 1);
  selectSource(
    draft.value.sources.length ? Math.min(selectedIndex.value, draft.value.sources.length - 1) : -1,
  );
}
watch(
  () => props.visible,
  (visible) => {
    if (visible && !props.picking) {
      draft.value = copyDraft(props.initial);
      selectSource(draft.value.sources.length ? 0 : -1);
    }
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
    width="min(640px, calc(100vw - 32px))"
    :visible="visible && !picking"
    :header="t('dataTools.consolidate.title')"
    :confirm-btn="{ content: t('dataTools.consolidate.apply'), disabled: busy || !canApply }"
    :cancel-btn="t('dataTools.consolidate.close')"
    :close-btn="!busy"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    @close="emit('close')"
    @confirm="!busy && canApply && emit('apply', copyDraft(draft))"
  >
    <div class="consolidate-dialog">
      <section class="consolidate-dialog__functions">
        <span class="consolidate-dialog__heading">{{ t("dataTools.consolidate.function") }}</span>
        <OptionList
          class="consolidate-dialog__function-list"
          :model-value="draft.function"
          :options="functions"
          :label="t('dataTools.consolidate.function')"
          :inert="busy || undefined"
          variant="navigation"
          item-data-attribute="data-consolidate-function"
          @select="!busy && (draft.function = $event)"
        />
      </section>
      <div class="consolidate-dialog__settings">
        <div class="consolidate-dialog__field">
          <span>{{ t("dataTools.consolidate.reference") }}</span>
          <RangeReferenceInput
            v-model="reference"
            :disabled="busy"
            :label="t('dataTools.consolidate.reference')"
            :pick-label="t('dataTools.consolidate.pickRange')"
            :select-reference="selectSourceReference"
            placeholder="Sheet1!$A$1:$C$10"
            @enter="addSource"
          />
        </div>
        <section class="consolidate-dialog__field">
          <span>{{ t("dataTools.consolidate.sources") }}</span>
          <OptionList
            class="consolidate-dialog__list"
            :model-value="selectedIndex >= 0 ? String(selectedIndex) : undefined"
            :options="sourceOptions"
            :label="t('dataTools.consolidate.sources')"
            :inert="busy || undefined"
            overflow="ellipsis"
            @select="!busy && selectSource(Number($event))"
            @keydown.delete.stop.prevent="removeSource"
          />
          <div class="consolidate-dialog__actions">
            <TButton
              size="small"
              variant="outline"
              :disabled="busy || !canAdd"
              @click="addSource"
              >{{ t("dataTools.consolidate.addSource") }}</TButton
            >
            <TButton
              size="small"
              variant="outline"
              :disabled="busy || selectedIndex < 0"
              @click="removeSource"
              >{{ t("dataTools.consolidate.removeSource") }}</TButton
            >
          </div>
        </section>
        <section class="consolidate-dialog__labels">
          <span class="consolidate-dialog__heading">{{
            t("dataTools.consolidate.labelPosition")
          }}</span>
          <div class="consolidate-dialog__checks">
            <TCheckbox v-model="draft.topRow" :disabled="busy">{{
              t("dataTools.consolidate.topRow")
            }}</TCheckbox>
            <TCheckbox v-model="draft.leftColumn" :disabled="busy">{{
              t("dataTools.consolidate.leftColumn")
            }}</TCheckbox>
          </div>
        </section>
        <div class="consolidate-dialog__field">
          <span>{{ t("dataTools.consolidate.destination") }}</span>
          <RangeReferenceInput
            v-model="draft.destination"
            :disabled="busy"
            :label="t('dataTools.consolidate.destination')"
            :pick-label="t('dataTools.consolidate.pickDestination')"
            placeholder="E1"
            :select-reference="
              async () => {
                emit('pickRange', 'destination');
                return undefined;
              }
            "
          />
        </div>
        <TCheckbox v-model="draft.overwrite" :disabled="busy">{{
          t("dataTools.consolidate.overwrite")
        }}</TCheckbox>
        <details v-if="preview" class="consolidate-dialog__preview">
          <summary>
            {{
              t("dataTools.consolidate.preview", { rows: preview.rows, columns: preview.columns })
            }}
          </summary>
          <p>
            {{
              t("dataTools.consolidate.previewCounts", {
                sourceCells: preview.sourceCells,
                outputCells: preview.outputCells,
                numericValues: preview.numericValues,
              })
            }}
          </p>
          <div class="consolidate-dialog__sample">
            <div
              v-for="(row, rowIndex) in preview.sample"
              :key="rowIndex"
              class="consolidate-dialog__sample-row"
              :style="{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }"
            >
              <span v-for="(value, columnIndex) in row" :key="columnIndex">{{ value }}</span>
            </div>
          </div>
        </details>
        <p v-if="error" class="consolidate-dialog__error" role="alert">{{ error }}</p>
      </div>
    </div>
  </Dialog>
</template>

<style scoped lang="scss">
.consolidate-dialog {
  display: grid;
  grid-template-columns: 144px minmax(0, 1fr);
  gap: var(--idea-space-4);
  &__functions {
    display: flex;
    flex-direction: column;
    gap: var(--idea-space-2);
    min-width: 0;
  }
  &__function-list {
    flex: 1;
  }
  &__settings {
    display: grid;
    gap: var(--idea-space-2);
    min-width: 0;
    align-content: start;
  }
  &__field,
  &__labels {
    display: grid;
    gap: var(--idea-space-1);
  }
  &__labels {
    margin-top: var(--idea-space-1);
  }
  &__heading {
    font-weight: 600;
  }
  &__actions,
  &__checks {
    display: flex;
    align-items: center;
    gap: var(--idea-space-2);
  }
  &__list {
    height: 104px;
  }
  &__preview {
    color: var(--idea-text-secondary);
    summary {
      cursor: pointer;
    }
    p {
      margin: var(--idea-space-1) 0;
    }
  }
  &__sample {
    border: 1px solid var(--idea-border-subtle);
  }
  &__sample-row {
    display: grid;
    span {
      padding: var(--idea-space-1);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      border-right: 1px solid var(--idea-border-subtle);
    }
  }
  &__error {
    margin: 0;
    color: var(--idea-status-error);
  }
}
@media (max-width: 560px) {
  .consolidate-dialog {
    grid-template-columns: 112px minmax(0, 1fr);
    gap: var(--idea-space-2);
    &__checks {
      flex-wrap: wrap;
    }
  }
}
</style>
