<script setup lang="ts">
import { SquareMousePointer } from "lucide-vue-next";
import { computed, ref, watch } from "vue";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Form as TForm, FormItem as TFormItem } from "tdesign-vue-next/es/form";
import { Input as TInput } from "tdesign-vue-next/es/input";
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
async function pick(field: "formulaCell" | "changingCell") {
  const value = await props.selectReference?.(draft.value[field], { singleCell: true });
  if (value !== undefined) draft.value[field] = value;
}
const statusLabel = computed(() =>
  props.result
    ? tr(
        `simulation.status${props.result.status[0]!.toUpperCase()}${props.result.status.slice(1)}` as SimulationMessageKey,
      )
    : "",
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
          ><TInput
            v-model="draft.formulaCell"
            :disabled="busy"
            :aria-label="tr('simulation.formulaCell')"
            :placeholder="tr('simulation.formulaCell')"
            ><template #suffix
              ><TButton
                variant="text"
                shape="square"
                :disabled="busy"
                :aria-label="tr('simulation.selectCell')"
                @click="pick('formulaCell')"
                ><SquareMousePointer /></TButton></template></TInput></TFormItem
        ><TFormItem :label="tr('simulation.targetValue')"
          ><TInput
            v-model="draft.targetValue"
            :disabled="busy"
            :aria-label="tr('simulation.targetValue')"
            :placeholder="tr('simulation.targetValue')"
            inputmode="decimal" /></TFormItem
        ><TFormItem :label="tr('simulation.changingCell')"
          ><TInput
            v-model="draft.changingCell"
            :disabled="busy"
            :aria-label="tr('simulation.changingCell')"
            :placeholder="tr('simulation.changingCell')"
            ><template #suffix
              ><TButton
                variant="text"
                shape="square"
                :disabled="busy"
                :aria-label="tr('simulation.selectCell')"
                @click="pick('changingCell')"
                ><SquareMousePointer /></TButton></template></TInput></TFormItem
      ></TForm>
      <p v-if="error" class="simulation-dialog__error" role="alert">{{ error }}</p>
      <section v-if="result" class="simulation-dialog__result">
        <strong>{{ tr("simulation.result") }} · {{ statusLabel }}</strong>
        <p>{{ tr("simulation.previewOnly") }}</p>
        <dl>
          <template v-if="result.objectiveValue !== undefined"
            ><dt>{{ tr("simulation.objectiveValue") }}</dt>
            <dd>{{ result.objectiveValue }}</dd></template
          ><template v-if="result.targetResidual !== undefined"
            ><dt>{{ tr("simulation.residual") }}</dt>
            <dd>{{ result.targetResidual }}</dd></template
          ><template v-for="change in result.changes" :key="change.cell"
            ><dt>{{ change.cell }}</dt>
            <dd>{{ change.value }}</dd></template
          >
        </dl>
        <p v-if="!result.changes.length">{{ tr("simulation.noChanges") }}</p>
      </section>
    </div>
  </Dialog>
</template>
<style scoped lang="scss">
.simulation-dialog {
  display: grid;
  gap: 12px;
  &__error {
    color: var(--idea-status-error);
    margin: 0;
  }
  &__result {
    border-top: 1px solid var(--idea-border-subtle);
    padding-top: 12px;
    p {
      color: var(--idea-text-secondary);
      margin: 6px 0;
    }
    dl {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 4px 16px;
      margin: 8px 0 0;
    }
    dd {
      margin: 0;
      font-variant-numeric: tabular-nums;
    }
  }
}
</style>
