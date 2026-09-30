<script setup lang="ts">
import { computed } from "vue";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { useAppI18n } from "../../../shared/i18n";

const above = defineModel<boolean>("above", { required: true });
const equalAverage = defineModel<boolean | undefined>("equalAverage");
const stdDev = defineModel<number | undefined>("stdDev");
const { t } = useAppI18n();
type AverageOption = {
  value: string;
  label: string;
  above: boolean;
  equalAverage?: boolean;
  stdDev?: number;
};
const options = computed<AverageOption[]>(() => [
  { value: "above", label: t("conditionalFormatting.averageAbove"), above: true },
  { value: "below", label: t("conditionalFormatting.averageBelow"), above: false },
  {
    value: "aboveEqual",
    label: t("conditionalFormatting.averageEqualAbove"),
    above: true,
    equalAverage: true,
  },
  {
    value: "belowEqual",
    label: t("conditionalFormatting.averageEqualBelow"),
    above: false,
    equalAverage: true,
  },
  ...[1, 2, 3].flatMap((value) => [
    {
      value: `above${value}`,
      label: t("conditionalFormatting.averageDeviationAbove", { value }),
      above: true,
      stdDev: value,
    },
    {
      value: `below${value}`,
      label: t("conditionalFormatting.averageDeviationBelow", { value }),
      above: false,
      stdDev: value,
    },
  ]),
]);
const selection = computed({
  get: () =>
    `${above.value ? "above" : "below"}${stdDev.value || (equalAverage.value ? "Equal" : "")}`,
  set: (value: string) => {
    const option = options.value.find((item) => item.value === value);
    if (!option) return;
    above.value = option.above;
    equalAverage.value = option.equalAverage;
    stdDev.value = option.stdDev;
  },
});
</script>

<template>
  <div
    class="average-criteria"
    role="group"
    :aria-label="t('conditionalFormatting.averageDescription')"
  >
    <TSelect
      v-model="selection"
      :options="options"
      :aria-label="t('conditionalFormatting.comparison')"
    />
    <span>{{ t("conditionalFormatting.averageScope") }}</span>
  </div>
</template>

<style scoped lang="scss">
.average-criteria {
  display: grid;
  grid-template-columns: minmax(0, 180px) minmax(0, 1fr);
  align-items: center;
  gap: 8px;
}
</style>
