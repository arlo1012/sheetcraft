<script setup lang="ts">
import { Plus, SquareMousePointer, Trash2 } from "lucide-vue-next";
import { computed, ref, watch } from "vue";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Form as TForm, FormItem as TFormItem } from "tdesign-vue-next/es/form";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { Radio as TRadio, RadioGroup as TRadioGroup } from "tdesign-vue-next/es/radio";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { useAppI18n } from "../../../shared/i18n";
import type { RangeReferenceSelectionOptions } from "../../../shared/range-reference/useRangeReferencePicker";
import type { SimulationMessageKey } from "../simulation-messages";
import type {
  PlanningConstraintDraft,
  PlanningDraft,
  PlanningVariableDraft,
  SimulationResult,
} from "../simulation-types";
const props = withDefaults(
  defineProps<{
    visible: boolean;
    initial: PlanningDraft;
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
  solve: [draft: PlanningDraft];
  apply: [];
  draftChange: [draft: PlanningDraft];
}>();
const { t, locale } = useAppI18n();
const tr = (key: SimulationMessageKey) => t(key as never);
let serial = 0;
const id = () => `simulation-${++serial}`;
const blankVariable = (): PlanningVariableDraft => ({
  id: id(),
  cell: "",
  kind: "continuous",
  lower: "",
  upper: "",
});
const blankConstraint = (): PlanningConstraintDraft => ({
  id: id(),
  left: "",
  relation: "lte",
  right: "",
});
const copy = (value: PlanningDraft): PlanningDraft => ({
  ...value,
  variables: value.variables.map((item) => ({ ...item })),
  constraints: value.constraints.map((item) => ({ ...item })),
});
const draft = ref(copy(props.initial));
const hasModel = computed(
  () =>
    Boolean(draft.value.objective.trim()) && draft.value.variables.some((item) => item.cell.trim()),
);
const canApply = computed(() =>
  Boolean(props.result && ["optimal", "feasible"].includes(props.result.status)),
);
const confirmLabel = computed(() =>
  !props.result || !canApply.value ? tr("simulation.solve") : tr("simulation.apply"),
);
watch(
  () => props.visible,
  (value) => {
    if (value && !props.suspended) draft.value = copy(props.initial);
  },
);
watch(
  () => props.initial,
  (value) => {
    if (props.visible && !props.suspended) draft.value = copy(value);
  },
  { deep: true },
);
watch(draft, (value) => emit("draftChange", copy(value)), { deep: true });
function removeVariable(index: number) {
  draft.value.variables.splice(index, 1);
}
function removeConstraint(index: number) {
  draft.value.constraints.splice(index, 1);
}
async function pick(
  target:
    | { kind: "objective" }
    | { kind: "variable"; index: number }
    | { kind: "constraint"; index: number; side: "left" | "right" },
) {
  if (target.kind === "objective") {
    const result = await props.selectReference?.(draft.value.objective, { singleCell: true });
    if (result !== undefined) draft.value.objective = result;
    return;
  }
  if (target.kind === "variable") {
    const item = draft.value.variables[target.index];
    if (!item) return;
    const result = await props.selectReference?.(item.cell, { singleCell: false });
    if (result !== undefined) item.cell = result;
    return;
  }
  const item = draft.value.constraints[target.index];
  if (!item) return;
  const current = item[target.side];
  const result = await props.selectReference?.(current, { singleCell: false });
  if (result === undefined) return;
  item[target.side] = result;
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
  else emit("solve", copy(draft.value));
}
const numericOptions = [
  { label: tr("simulation.continuous"), value: "continuous" },
  { label: tr("simulation.integer"), value: "integer" },
  { label: tr("simulation.binary"), value: "binary" },
];
</script>
<template>
  <Dialog
    role="dialog"
    aria-modal="true"
    :aria-label="tr('simulation.planning')"
    :visible="visible && !suspended"
    :header="tr('simulation.planning')"
    width="min(760px, calc(100vw - 32px))"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    :confirm-btn="{ content: confirmLabel, disabled: busy || !hasModel }"
    :cancel-btn="result ? tr('simulation.close') : tr('simulation.cancel')"
    :close-btn="!busy"
    @close="emit('close')"
    @confirm="confirm"
    ><div class="simulation-dialog simulation-dialog--solver">
      <TForm
        class="simulation-dialog__form"
        :data="draft"
        label-align="right"
        :label-width="locale === 'zh-CN' ? 84 : 108"
        ><TFormItem :label="tr('simulation.objective')"
          ><TInput
            v-model="draft.objective"
            :disabled="busy"
            :aria-label="tr('simulation.objective')"
            :placeholder="tr('simulation.objective')"
            ><template #suffix
              ><TButton
                variant="text"
                shape="square"
                :disabled="busy"
                :aria-label="tr('simulation.selectCell')"
                @click="pick({ kind: 'objective' })"
                ><SquareMousePointer /></TButton></template></TInput></TFormItem
        ><TFormItem :label="tr('simulation.direction')"
          ><TRadioGroup v-model="draft.direction" :disabled="busy"
            ><TRadio value="maximize">{{ tr("simulation.maximize") }}</TRadio
            ><TRadio value="minimize">{{ tr("simulation.minimize") }}</TRadio
            ><TRadio value="target">{{ tr("simulation.target") }}</TRadio></TRadioGroup
          ><TInput
            v-if="draft.direction === 'target'"
            v-model="draft.targetValue"
            class="simulation-dialog__target"
            :disabled="busy"
            :aria-label="tr('simulation.targetValue')"
            :placeholder="tr('simulation.targetValue')"
            inputmode="decimal" /></TFormItem
      ></TForm>
      <section>
        <div class="simulation-dialog__section-title">
          <strong>{{ tr("simulation.variables") }}</strong
          ><TButton
            theme="primary"
            variant="text"
            size="small"
            :disabled="busy"
            @click="draft.variables.push(blankVariable())"
            ><Plus :size="15" />{{ tr("simulation.addVariable") }}</TButton
          >
        </div>
        <div v-for="(item, index) in draft.variables" :key="item.id" class="simulation-dialog__row">
          <TInput
            v-model="item.cell"
            :disabled="busy"
            :placeholder="tr('simulation.cell')"
            :aria-label="tr('simulation.cell')"
            ><template #suffix
              ><TButton
                variant="text"
                shape="square"
                :disabled="busy"
                :aria-label="tr('simulation.selectCell')"
                @click="pick({ kind: 'variable', index })"
                ><SquareMousePointer /></TButton></template></TInput
          ><TSelect
            v-model="item.kind"
            :placeholder="tr('simulation.type')"
            :aria-label="tr('simulation.type')"
            :options="numericOptions"
            :disabled="busy"
          /><TInput
            v-model="item.lower"
            :disabled="busy"
            :placeholder="tr('simulation.lowerBound')"
            :aria-label="tr('simulation.lowerBound')"
            inputmode="decimal"
          /><TInput
            v-model="item.upper"
            :disabled="busy"
            :placeholder="tr('simulation.upperBound')"
            :aria-label="tr('simulation.upperBound')"
            inputmode="decimal"
          /><TButton
            variant="text"
            shape="square"
            :disabled="busy"
            :aria-label="tr('simulation.removeVariable')"
            @click="removeVariable(index)"
            ><Trash2 :size="16"
          /></TButton>
        </div>
      </section>
      <section>
        <div class="simulation-dialog__section-title">
          <strong>{{ tr("simulation.constraints") }}</strong
          ><TButton
            theme="primary"
            variant="text"
            size="small"
            :disabled="busy"
            @click="draft.constraints.push(blankConstraint())"
            ><Plus :size="15" />{{ tr("simulation.addConstraint") }}</TButton
          >
        </div>
        <div
          v-for="(item, index) in draft.constraints"
          :key="item.id"
          class="simulation-dialog__constraint"
        >
          <TInput
            v-model="item.left"
            :disabled="busy"
            :placeholder="tr('simulation.cell')"
            :aria-label="tr('simulation.cell')"
            ><template #suffix
              ><TButton
                variant="text"
                shape="square"
                :disabled="busy"
                :aria-label="tr('simulation.selectCell')"
                @click="pick({ kind: 'constraint', index, side: 'left' })"
                ><SquareMousePointer /></TButton></template></TInput
          ><TSelect
            v-model="item.relation"
            :placeholder="tr('simulation.relation')"
            :aria-label="tr('simulation.relation')"
            :disabled="busy"
            :options="[
              { label: '≤', value: 'lte' },
              { label: '≥', value: 'gte' },
              { label: '=', value: 'eq' },
            ]"
          /><TInput
            v-model="item.right"
            :disabled="busy"
            :placeholder="tr('simulation.rightSide')"
            :aria-label="tr('simulation.rightSide')"
          /><TButton
            variant="text"
            shape="square"
            :disabled="busy"
            :aria-label="tr('simulation.removeConstraint')"
            @click="removeConstraint(index)"
            ><Trash2 :size="16"
          /></TButton>
        </div>
      </section>
      <TCheckbox v-model="draft.nonnegative" :disabled="busy">{{
        tr("simulation.nonnegative")
      }}</TCheckbox>
      <p class="simulation-dialog__hint">
        {{ tr("simulation.linearOnly") }} · {{ tr("simulation.unsupportedNonlinear") }}
      </p>
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
        <p v-for="diagnostic in result.diagnostics" :key="diagnostic">{{ diagnostic }}</p>
      </section>
    </div></Dialog
  >
</template>
<style scoped lang="scss">
.simulation-dialog {
  display: grid;
  gap: 12px;
  &--solver {
    max-height: min(640px, 70vh);
    overflow: auto;
    padding-right: 3px;
  }
  &__form {
    margin-bottom: 4px;
  }
  &__target {
    width: 110px;
    margin-left: 12px;
  }
  &__section-title {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin: 2px 0 7px;
  }
  &__row,
  &__constraint {
    display: grid;
    grid-template-columns: minmax(120px, 1fr) 120px minmax(95px, 0.7fr) minmax(95px, 0.7fr) 32px;
    gap: 8px;
    margin: 6px 0;
    align-items: center;
  }
  &__constraint {
    grid-template-columns: minmax(140px, 1fr) 82px minmax(140px, 1fr) 32px;
  }
  &__hint {
    margin: 0;
    color: var(--idea-text-secondary);
    font-size: 12px;
  }
  &__error {
    margin: 0;
    color: var(--idea-status-error);
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
@media (max-width: 600px) {
  .simulation-dialog__row,
  .simulation-dialog__constraint {
    grid-template-columns: 1fr 1fr 32px;
  }
  .simulation-dialog__row :nth-child(1),
  .simulation-dialog__constraint :nth-child(1) {
    grid-column: span 2;
  }
}
</style>
