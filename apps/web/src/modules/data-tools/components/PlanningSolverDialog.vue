<script setup lang="ts">
import { Trash2 } from "lucide-vue-next";
import { computed, ref, watch } from "vue";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { Radio as TRadio, RadioGroup as TRadioGroup } from "tdesign-vue-next/es/radio";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import SimulationResultPanel from "./SimulationResultPanel.vue";
import RangeReferenceInput from "../../../shared/range-reference/RangeReferenceInput.vue";
import { useAppI18n } from "../../../shared/i18n";
import { vIconAction } from "../../../shared/focus/icon-action";
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
const { t } = useAppI18n();
const tr = (key: SimulationMessageKey) => t(key);
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
const selectCellReference = computed(() =>
  props.selectReference
    ? (current: string) => props.selectReference!(current, { singleCell: true })
    : undefined,
);
const selectRangeReference = computed(() =>
  props.selectReference
    ? (current: string) => props.selectReference!(current, { singleCell: false })
    : undefined,
);
const discrete = (relation: PlanningConstraintDraft["relation"]) =>
  relation === "integer" || relation === "binary";
function confirm() {
  if (canApply.value) emit("apply");
  else emit("solve", copy(draft.value));
}
const numericOptions = computed(() => [
  { label: tr("simulation.continuous"), value: "continuous" },
  { label: tr("simulation.integer"), value: "integer" },
  { label: tr("simulation.binary"), value: "binary" },
]);
const relationOptions = computed(() => [
  { label: "≤", value: "lte" },
  { label: "=", value: "eq" },
  { label: "≥", value: "gte" },
  { label: `int · ${tr("simulation.integer")}`, value: "integer" },
  { label: `bin · ${tr("simulation.binary")}`, value: "binary" },
]);
const methodOptions = computed(() => [
  { label: tr("simulation.methodSimplex"), value: "simplex" },
  { label: tr("simulation.methodGrg"), value: "grg" },
  { label: tr("simulation.methodEvolutionary"), value: "evolutionary" },
]);
const methodHint = computed(() =>
  draft.value.method === "grg"
    ? tr("simulation.methodGrgHint")
    : draft.value.method === "evolutionary"
      ? tr("simulation.methodEvolutionaryHint")
      : tr("simulation.methodSimplexHint"),
);
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
  >
    <div class="simulation-dialog">
      <div class="simulation-dialog__fields">
        <div class="simulation-dialog__field">
          <span>{{ tr("simulation.objective") }}</span>
          <RangeReferenceInput
            v-model="draft.objective"
            :disabled="busy"
            :label="tr('simulation.objective')"
            :placeholder="tr('simulation.objective')"
            :pick-label="tr('simulation.selectCell')"
            :select-reference="selectCellReference"
          />
        </div>
        <div class="simulation-dialog__field">
          <span>{{ tr("simulation.direction") }}</span>
          <div class="simulation-dialog__direction">
            <TRadioGroup
              v-model="draft.direction"
              :disabled="busy"
              :aria-label="tr('simulation.direction')"
            >
              <TRadio value="maximize">{{ tr("simulation.maximize") }}</TRadio>
              <TRadio value="minimize">{{ tr("simulation.minimize") }}</TRadio>
              <TRadio value="target">{{ tr("simulation.target") }}</TRadio>
            </TRadioGroup>
            <TInput
              v-if="draft.direction === 'target'"
              v-model="draft.targetValue"
              class="simulation-dialog__target"
              :disabled="busy"
              :aria-label="tr('simulation.targetValue')"
              :placeholder="tr('simulation.targetValue')"
              inputmode="decimal"
            />
          </div>
        </div>
      </div>
      <section class="simulation-dialog__section" :aria-label="tr('simulation.variables')">
        <div class="simulation-dialog__section-title">
          <strong>{{ tr("simulation.variables") }}</strong>
          <TButton
            theme="primary"
            variant="text"
            size="small"
            :disabled="busy"
            @click="draft.variables.push(blankVariable())"
          >
            {{ tr("simulation.addVariable") }}
          </TButton>
        </div>
        <div v-for="(item, index) in draft.variables" :key="item.id" class="simulation-dialog__row">
          <RangeReferenceInput
            v-model="item.cell"
            :disabled="busy"
            :label="tr('simulation.variables')"
            :placeholder="tr('simulation.cell')"
            :select-reference="selectRangeReference"
          />
          <TSelect
            v-model="item.kind"
            :placeholder="tr('simulation.type')"
            :aria-label="tr('simulation.type')"
            :options="numericOptions"
            :disabled="busy"
          />
          <TInput
            v-model="item.lower"
            :disabled="busy"
            :placeholder="tr('simulation.lowerBound')"
            :aria-label="tr('simulation.lowerBound')"
            inputmode="decimal"
          />
          <TInput
            v-model="item.upper"
            :disabled="busy"
            :placeholder="tr('simulation.upperBound')"
            :aria-label="tr('simulation.upperBound')"
            inputmode="decimal"
          />
          <span
            v-icon-action="busy"
            :aria-label="tr('simulation.removeVariable')"
            @click="removeVariable(index)"
          >
            <Trash2 class="simulation-dialog__action-icon" />
          </span>
        </div>
      </section>
      <section class="simulation-dialog__section" :aria-label="tr('simulation.constraints')">
        <div class="simulation-dialog__section-title">
          <strong>{{ tr("simulation.constraints") }}</strong>
          <TButton
            theme="primary"
            variant="text"
            size="small"
            :disabled="busy"
            @click="draft.constraints.push(blankConstraint())"
          >
            {{ tr("simulation.addConstraint") }}
          </TButton>
        </div>
        <div
          v-for="(item, index) in draft.constraints"
          :key="item.id"
          class="simulation-dialog__constraint"
        >
          <RangeReferenceInput
            v-model="item.left"
            :disabled="busy"
            :label="tr('simulation.cell')"
            :placeholder="tr('simulation.cell')"
            :select-reference="selectRangeReference"
          />
          <TSelect
            v-model="item.relation"
            :placeholder="tr('simulation.relation')"
            :aria-label="tr('simulation.relation')"
            :disabled="busy"
            :options="relationOptions"
          />
          <TInput
            v-if="discrete(item.relation)"
            :value="
              item.relation === 'integer'
                ? tr('simulation.integerConstraint')
                : tr('simulation.binaryConstraint')
            "
            :aria-label="tr('simulation.rightSide')"
            disabled
          />
          <RangeReferenceInput
            v-else
            v-model="item.right"
            :disabled="busy"
            :label="tr('simulation.rightSide')"
            :placeholder="tr('simulation.rightSide')"
            :select-reference="selectRangeReference"
          />
          <span
            v-icon-action="busy"
            :aria-label="tr('simulation.removeConstraint')"
            @click="removeConstraint(index)"
          >
            <Trash2 class="simulation-dialog__action-icon" />
          </span>
        </div>
      </section>
      <TCheckbox v-model="draft.nonnegative" :disabled="busy">{{
        tr("simulation.nonnegative")
      }}</TCheckbox>
      <div class="simulation-dialog__method">
        <div class="simulation-dialog__field">
          <span>{{ tr("simulation.method") }}</span>
          <TSelect
            v-model="draft.method"
            :disabled="busy"
            :aria-label="tr('simulation.method')"
            :placeholder="tr('simulation.method')"
            :options="methodOptions"
          />
        </div>
        <p class="simulation-dialog__hint">{{ methodHint }}</p>
      </div>
      <p v-if="error" class="simulation-dialog__error" role="alert">{{ error }}</p>
      <SimulationResultPanel v-if="result" :result="result" /></div
  ></Dialog>
</template>
<style scoped lang="scss">
.simulation-dialog {
  display: grid;
  gap: 12px;
  max-height: min(640px, 70vh);
  overflow: auto;

  &__fields,
  &__section,
  &__method {
    display: grid;
    gap: 8px;
    min-width: 0;
  }
  &__field {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    align-items: center;
    gap: 8px;
    > span {
      min-width: 76px;
    }
  }
  &__direction {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  &__target {
    width: 110px;
  }
  &__section-title {
    display: flex;
    justify-content: space-between;
    align-items: center;
    strong {
      font-weight: 500;
    }
  }
  &__row,
  &__constraint {
    display: grid;
    grid-template-columns: minmax(140px, 1fr) 100px minmax(80px, 0.65fr) minmax(80px, 0.65fr) 28px;
    gap: 8px;
    align-items: center;
    > * {
      min-width: 0;
    }
  }
  &__row > [role="button"],
  &__constraint > [role="button"] {
    width: 28px;
    height: 28px;
  }
  &__constraint {
    grid-template-columns: minmax(140px, 1fr) 110px minmax(140px, 1fr) 28px;
  }
  &__action-icon {
    width: var(--sheetcraft-action-icon-size);
    height: var(--sheetcraft-action-icon-size);
  }
  &__hint {
    margin: 0;
    color: var(--sheetcraft-text-secondary);
  }
  &__error {
    margin: 0;
    color: var(--sheetcraft-status-error);
  }
}
@media (max-width: 600px) {
  .simulation-dialog {
    &__row,
    &__constraint {
      grid-template-columns: 1fr 1fr 28px;
    }
    &__row > :first-child,
    &__constraint > :first-child {
      grid-column: span 2;
    }
  }
}
</style>
