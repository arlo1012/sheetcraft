<script setup lang="ts">
import { computed, ref } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Radio, RadioGroup } from "tdesign-vue-next/es/radio";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import { getPivotSource } from "@idea10/core/pivot-tables";
import type { Workbook } from "@idea10/core/workbook";
import type { PivotDraft } from "../usePivotActions";
import { useAppI18n } from "../../../shared/i18n";
import RangeReferenceInput from "../../../shared/range-reference/RangeReferenceInput.vue";
import { resolveRangeReference } from "../../../shared/range-reference/formatRangeReference";
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
  const reference = resolveRangeReference(
    props.workbook,
    draft.value.source,
    draft.value.referenceSheetId,
  );
  if (!reference) return false;
  try {
    getPivotSource(props.workbook, reference.sheetId, reference.range);
    return true;
  } catch {
    return false;
  }
});
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
    width="440px"
    :close-on-overlay-click="false"
    :confirm-btn="{ content: t('picture.confirm'), disabled: disabled || !validSource }"
    :cancel-btn="t('picture.cancel')"
    @confirm="emit('confirm', draft)"
    @close="emit('close')"
  >
    <div class="pivot-create">
      <section v-if="initial.mode !== 'move'" class="pivot-create__section">
        <h3>{{ t("pivot.chooseSource") }}</h3>
        <Radio :checked="true">{{ t("pivot.cellRange") }}</Radio>
        <RangeReferenceInput
          v-model="draft.source"
          :label="t('chart.source')"
          :select-reference="selectReference"
          :disabled="disabled"
        />
      </section>
      <section v-if="initial.mode !== 'source'" class="pivot-create__section">
        <h3>{{ t("pivot.chooseDestination") }}</h3>
        <RadioGroup
          v-if="!initial.existing"
          :value="draft.newSheet ? 'new' : 'existing'"
          class="pivot-create__locations"
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
        <Checkbox
          v-if="error && (!errorReason || errorReason === 'overwrite') && !draft.newSheet"
          v-model="draft.overwrite"
          >{{ t("pivot.overwrite") }}</Checkbox
        >
      </section>
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
