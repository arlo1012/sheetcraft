<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Form as TForm, FormItem as TFormItem } from "tdesign-vue-next/es/form";
import { Input as TInput } from "tdesign-vue-next/es/input";
import SimulationResultPanel from "./SimulationResultPanel.vue";
import RangeReferenceInput from "../../../shared/range-reference/RangeReferenceInput.vue";
import { useAppI18n } from "../../../shared/i18n";
import type { RangeReferenceSelectionOptions } from "../../../shared/range-reference/useRangeReferencePicker";
import type { SimulationMessageKey } from "../simulation-messages";
import type { GoalSeekDraft, SimulationResult } from "../simulation-types";
const props = withDefaults(
  defineProps<{
    visible: boolean;
    initial: GoalSeekDraft;
    busy?: boolean;
    error?: string;
    result?: SimulationResult;
    suspended?: boolean;
    selectReference?: (
      current: string,
      options?: RangeReferenceSelectionOptions,
    ) => Promise<string | undefined>;
  }>(),
  { busy: false, error: "", result: undefined, suspended: false, selectReference: undefined },
);
const emit = defineEmits<{
  close: [];
  solve: [draft: GoalSeekDraft];
  apply: [];
  draftChange: [draft: GoalSeekDraft];
}>();
const { t, locale } = useAppI18n();
const tr = (key: SimulationMessageKey) => t(key as never);
const draft = ref<GoalSeekDraft>({ ...props.initial });
const canSolve = computed(() =>
  Boolean(
    draft.value.formulaCell.trim() &&
    draft.value.changingCell.trim() &&
    draft.value.targetValue.trim(),
  ),
);
const canApply = computed(() =>
  Boolean(props.result && ["optimal", "feasible"].includes(props.result.status)),
);
const confirmLabel = computed(() =>
  !props.result || !canApply.value ? tr("simulation.solve") : tr("simulation.apply"),
);
watch(
  () => props.visible,
  (visible) => {
    if (visible && !props.suspended) draft.value = { ...props.initial };
  },
);
watch(
  () => props.initial,
  (value) => {
    if (props.visible && !props.suspended) draft.value = { ...value };
  },
  { deep: true },
);
watch(draft, (value) => emit("draftChange", { ...value }), { deep: true });
const selectCellReference = computed(() =>
  props.selectReference
    ? (current: string) => props.selectReference!(current, { singleCell: true })
    : undefined,
);
function confirm() {
  if (canApply.value) emit("apply");
  else emit("solve", { ...draft.value });
}
</script>
<template>
  <Dialog
    role="dialog"
    aria-modal="true"
    :aria-label="tr('simulation.goalSeek')"
    :visible="visible && !suspended"
    :header="tr('simulation.goalSeek')"
    width="min(480px, calc(100vw - 32px))"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    :confirm-btn="{ content: confirmLabel, disabled: busy || !canSolve }"
    :cancel-btn="result ? tr('simulation.close') : tr('simulation.cancel')"
    :close-btn="!busy"
    @close="emit('close')"
    @confirm="confirm"
  >
    <div class="simulation-dialog">
      <TForm :data="draft" label-align="right" :label-width="locale === 'zh-CN' ? 108 : 130"
        ><TFormItem :label="tr('simulation.formulaCell')"
          ><RangeReferenceInput
            v-model="draft.formulaCell"
            class="simulation-dialog__reference"
            :disabled="busy"
            :label="tr('simulation.formulaCell')"
            :placeholder="tr('simulation.formulaCell')"
            :pick-label="tr('simulation.selectCell')"
            :select-reference="selectCellReference" /></TFormItem
        ><TFormItem :label="tr('simulation.targetValue')"
          ><TInput
            v-model="draft.targetValue"
            :disabled="busy"
            :aria-label="tr('simulation.targetValue')"
            :placeholder="tr('simulation.targetValue')"
            inputmode="decimal" /></TFormItem
        ><TFormItem :label="tr('simulation.changingCell')"
          ><RangeReferenceInput
            v-model="draft.changingCell"
            class="simulation-dialog__reference"
            :disabled="busy"
            :label="tr('simulation.changingCell')"
            :placeholder="tr('simulation.changingCell')"
            :pick-label="tr('simulation.selectCell')"
            :select-reference="selectCellReference" /></TFormItem
      ></TForm>
      <p v-if="error" class="simulation-dialog__error" role="alert">{{ error }}</p>
      <SimulationResultPanel v-if="result" :result="result" />
    </div>
  </Dialog>
</template>
<style scoped lang="scss">
.simulation-dialog {
  display: grid;
  gap: 12px;
  &__reference {
    width: 100%;
  }
  &__error {
    color: var(--sheetcraft-status-error);
    margin: 0;
  }
}
</style>
