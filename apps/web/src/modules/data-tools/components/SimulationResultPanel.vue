<script setup lang="ts">
import { computed } from "vue";
import { useAppI18n } from "../../../shared/i18n";
import type { SimulationMessageKey } from "../simulation-messages";
import type { SimulationResult } from "../simulation-types";

const props = defineProps<{ result: SimulationResult }>();
const { t } = useAppI18n();
const applicable = computed(() => ["optimal", "feasible"].includes(props.result.status));
const hasValues = computed(
  () =>
    props.result.objectiveValue !== undefined ||
    props.result.targetResidual !== undefined ||
    props.result.changes.length > 0,
);
const statusLabel = computed(() =>
  t(
    `simulation.status${props.result.status[0]!.toUpperCase()}${props.result.status.slice(1)}` as SimulationMessageKey,
  ),
);
</script>

<template>
  <section class="simulation-result" aria-live="polite">
    <div class="simulation-result__heading">
      <strong>{{ t("simulation.result") }}</strong>
      <span>{{ statusLabel }}</span>
    </div>
    <dl v-if="hasValues" class="simulation-result__values">
      <template v-if="result.objectiveValue !== undefined">
        <dt>{{ t("simulation.objectiveValue") }}</dt>
        <dd>{{ result.objectiveValue }}</dd>
      </template>
      <template v-if="result.targetResidual !== undefined">
        <dt>{{ t("simulation.residual") }}</dt>
        <dd>{{ result.targetResidual }}</dd>
      </template>
      <template v-for="change in result.changes" :key="change.cell">
        <dt>{{ change.cell }}</dt>
        <dd>{{ change.value }}</dd>
      </template>
    </dl>
    <p v-if="applicable && result.changes.length">{{ t("simulation.previewOnly") }}</p>
    <p v-else-if="applicable">{{ t("simulation.noChanges") }}</p>
    <p v-for="diagnostic in result.diagnostics" :key="diagnostic">{{ diagnostic }}</p>
  </section>
</template>

<style scoped lang="scss">
.simulation-result {
  display: grid;
  gap: 8px;
  border-top: 1px solid var(--sheetcraft-border-subtle);
  padding-top: 8px;

  &__heading {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 8px;
    strong {
      font-weight: 500;
    }
  }
  &__values {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 4px 16px;
    margin: 0;
    dt {
      overflow-wrap: anywhere;
    }
    dd {
      margin: 0;
      font-variant-numeric: tabular-nums;
    }
  }
  p {
    margin: 0;
    color: var(--sheetcraft-text-secondary);
  }
}
</style>
