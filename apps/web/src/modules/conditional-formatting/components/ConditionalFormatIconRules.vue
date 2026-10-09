<script setup lang="ts">
import type {
  ConditionalFormatCondition,
  ConditionalFormatIconSet,
  ConditionalFormatIconThreshold,
  ConditionalFormatThreshold,
} from "@sheetcraft/core/conditional-formatting";
import { getConditionalFormatIcon } from "@sheetcraft/core/conditional-formatting";
import { Option as TOption, Select as TSelect } from "tdesign-vue-next/es/select";
import { computed } from "vue";
import { iconSetPresetTiles } from "../conditional-format-presets";
import { useAppI18n, type MessageKey } from "../../../shared/i18n";
import RangeReferenceInput from "../../../shared/range-reference/RangeReferenceInput.vue";
import ConditionalFormatPreview from "./ConditionalFormatPreview.vue";

type IconChoice = { iconSet: ConditionalFormatIconSet; iconIndex: number } | null;
const props = defineProps<{
  condition: Extract<ConditionalFormatCondition, { kind: "iconSet" }>;
  selectValueReference?: (current: string) => Promise<string | undefined>;
}>();
const emit = defineEmits<{
  updateKind: [index: number, kind: ConditionalFormatThreshold["kind"]];
  updateValue: [index: number, value: string];
  updateInclusive: [index: number, inclusive: boolean];
  updateIcon: [index: number, icon: IconChoice];
}>();
const { t } = useAppI18n();
const rows = computed(() =>
  props.condition.thresholds.map((entry, index) => ({ entry, index })).reverse(),
);
const thresholdOptionsBase = computed(() =>
  (["num", "percent", "formula", "percentile"] as const).map((value) => ({
    value,
    label: t(
      `conditionalFormatting.${value === "formula" ? "thresholdFormula" : value}` as MessageKey,
    ),
  })),
);
const iconChoices = computed(() => {
  const choices = new Map<string, Exclude<IconChoice, null>>();
  for (const iconSet of iconSetPresetTiles) {
    for (let iconIndex = 0; iconIndex < iconCount(iconSet); iconIndex++) {
      const icon = { iconSet, iconIndex };
      const key = iconAppearanceKey(icon);
      if (!choices.has(key)) choices.set(key, icon);
    }
  }
  return Array.from(choices, ([value, icon]) => ({ value, icon }));
});
// Several preset families share the same glyph. Use its appearance for picker
// identity only; opening the picker must not rewrite the stored icon reference.
function iconAppearanceKey({ iconSet, iconIndex }: Exclude<IconChoice, null>): string {
  if (iconSet.includes("Arrows")) {
    const count = iconCount(iconSet);
    const direction =
      count === 3 ? [0, 2, 4][iconIndex] : count === 4 ? [0, 1, 3, 4][iconIndex] : iconIndex;
    return `arrows:${iconSet.endsWith("Gray") ? "gray" : "color"}:${direction}`;
  }
  if (iconSet === "fourRatings") return `fiveRatings:${iconIndex + 1}`;
  if (iconSet === "threeSigns" && iconIndex === 2) return "threeTrafficLights:2";
  if (iconSet === "fourTrafficLights" && iconIndex >= 2)
    return `threeTrafficLights:${iconIndex - 1}`;
  if (iconSet === "fourRedToBlack") {
    if (iconIndex === 3) return "threeTrafficLights:0";
    if (iconIndex === 0) return "fourTrafficLights:0";
  }
  if (iconSet === "fiveQuarters" && iconIndex === 4) return "fourTrafficLights:0";
  return `${iconSet}:${iconIndex}`;
}
function iconCount(iconSet: ConditionalFormatIconSet): number {
  return iconSet.startsWith("three") ? 3 : iconSet.startsWith("four") ? 4 : 5;
}
function iconCondition(
  iconSet: ConditionalFormatIconSet,
): Extract<ConditionalFormatCondition, { kind: "iconSet" }> {
  const count = iconCount(iconSet);
  return {
    kind: "iconSet",
    iconSet,
    thresholds: Array.from({ length: count }, (_, index) => ({
      kind: "percent",
      value: (index * 100) / count,
    })),
  };
}
function selectedIcon(index: number): IconChoice {
  return getConditionalFormatIcon(props.condition, index);
}
function iconValue(index: number): string {
  const icon = selectedIcon(index);
  return icon ? iconAppearanceKey(icon) : "none";
}
function updateIcon(index: number, value: string): void {
  if (value === "none") return emit("updateIcon", index, null);
  const choice = iconChoices.value.find((option) => option.value === value);
  if (choice) emit("updateIcon", index, choice.icon);
}
function thresholdOptions(entry: ConditionalFormatIconThreshold) {
  const options = thresholdOptionsBase.value;
  return entry.kind === "min" || entry.kind === "max"
    ? [...options, { value: entry.kind, label: t(`conditionalFormatting.${entry.kind}`) }]
    : options;
}
function hasValue(
  entry: ConditionalFormatIconThreshold,
): entry is Extract<
  ConditionalFormatIconThreshold,
  { kind: "num" | "percent" | "percentile" | "formula" }
> {
  return (
    entry.kind === "num" ||
    entry.kind === "percent" ||
    entry.kind === "percentile" ||
    entry.kind === "formula"
  );
}
function boundLabel(entry: ConditionalFormatIconThreshold): string {
  if (entry.kind === "formula") return entry.formula;
  return hasValue(entry)
    ? String(entry.value)
    : t(`conditionalFormatting.${entry.kind}` as MessageKey);
}
function upperComparator(entry: ConditionalFormatIconThreshold): string {
  return entry.inclusive === false ? "≤" : "<";
}
function iconLabel(icon: Exclude<IconChoice, null>): string {
  return `${t(`conditionalFormatting.${icon.iconSet}` as MessageKey)} ${icon.iconIndex + 1}`;
}
</script>

<template>
  <section class="icon-rules" :aria-label="t('conditionalFormatting.iconRules')">
    <h4>{{ t("conditionalFormatting.iconRules") }}</h4>
    <div class="icon-rules__table">
      <div class="icon-rules__header" aria-hidden="true">
        <span>{{ t("conditionalFormatting.icon") }}</span>
        <span class="icon-rules__condition-heading" />
        <span>{{ t("conditionalFormatting.value") }}</span>
        <span>{{ t("conditionalFormatting.thresholdType") }}</span>
      </div>
      <div
        v-for="{ entry, index } in rows"
        :key="index"
        class="icon-rules__row"
        role="group"
        :aria-label="`${t('conditionalFormatting.threshold')} ${index + 1}`"
      >
        <TSelect
          class="icon-rules__icon-select"
          :model-value="iconValue(index)"
          :popup-props="{
            overlayClassName: 'idea-icon-grid-options',
            overlayInnerStyle: { width: '224px' },
          }"
          :aria-label="`${t('conditionalFormatting.icon')} ${index + 1}`"
          @update:model-value="updateIcon(index, $event as string)"
        >
          <template #valueDisplay>
            <span v-if="selectedIcon(index) === null" class="icon-rules__no-icon">—</span>
            <ConditionalFormatPreview v-else compact :condition="condition" :icon-index="index" />
          </template>
          <TOption
            class="idea-icon-grid-options__none"
            value="none"
            :label="t('conditionalFormatting.noIcon')"
          >
            {{ t("conditionalFormatting.noIcon") }}
          </TOption>
          <TOption
            v-for="choice in iconChoices"
            :key="choice.value"
            :value="choice.value"
            :label="iconLabel(choice.icon)"
            :title="iconLabel(choice.icon)"
          >
            <ConditionalFormatPreview
              compact
              :condition="iconCondition(choice.icon.iconSet)"
              :icon-index="choice.icon.iconIndex"
            />
          </TOption>
        </TSelect>
        <template v-if="index > 0">
          <span v-if="index === condition.thresholds.length - 1" class="icon-rules__when">{{
            t("conditionalFormatting.whenValue")
          }}</span>
          <span
            v-else
            class="icon-rules__when"
            :title="`${t('conditionalFormatting.whenValue')} ${upperComparator(condition.thresholds[index + 1]!)} ${boundLabel(condition.thresholds[index + 1]!)} ${t('conditionalFormatting.and')}`"
          >
            {{ t("conditionalFormatting.whenValue") }}
            {{ upperComparator(condition.thresholds[index + 1]!) }}
            {{ boundLabel(condition.thresholds[index + 1]!) }} {{ t("conditionalFormatting.and") }}
          </span>
          <TSelect
            class="icon-rules__operator"
            :model-value="entry.inclusive === false ? 'strict' : 'inclusive'"
            :options="[
              { value: 'inclusive', label: '≥' },
              { value: 'strict', label: '>' },
            ]"
            :aria-label="`${t('conditionalFormatting.threshold')} ${index + 1} ${t('conditionalFormatting.condition')}`"
            @update:model-value="emit('updateInclusive', index, $event !== 'strict')"
          />
          <RangeReferenceInput
            v-if="hasValue(entry)"
            :model-value="entry.kind === 'formula' ? entry.formula : String(entry.value)"
            :label="`${t('conditionalFormatting.threshold')} ${index + 1} · ${t('conditionalFormatting.value')}`"
            :placeholder="t('conditionalFormatting.thresholdValueHint')"
            :show-picker="true"
            :select-reference="selectValueReference"
            @update:model-value="emit('updateValue', index, $event)"
          />
          <span v-else class="icon-rules__legacy-value">{{ boundLabel(entry) }}</span>
          <TSelect
            :model-value="entry.kind"
            :options="thresholdOptions(entry)"
            :aria-label="`${t('conditionalFormatting.threshold')} ${index + 1} · ${t('conditionalFormatting.thresholdType')}`"
            @update:model-value="
              emit('updateKind', index, $event as ConditionalFormatThreshold['kind'])
            "
          />
        </template>
        <span
          v-else
          class="icon-rules__last-bound"
          :title="`${t('conditionalFormatting.whenValue')} ${upperComparator(condition.thresholds[1]!)} ${boundLabel(condition.thresholds[1]!)}`"
        >
          {{ t("conditionalFormatting.whenValue") }}
          {{ upperComparator(condition.thresholds[1]!) }}
          {{ boundLabel(condition.thresholds[1]!) }}
        </span>
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
.icon-rules {
  display: grid;
  gap: 8px;
  min-width: 0;

  h4 {
    margin: 0;
    font: inherit;
    font-weight: var(--sheetcraft-font-weight-semibold);
  }
  &__table {
    display: grid;
    grid-template-columns: 64px minmax(100px, 1fr) 64px minmax(100px, 1fr) minmax(100px, 1fr);
    gap: 8px;
    overflow-x: auto;
  }
  &__header,
  &__row {
    display: grid;
    grid-template-columns: subgrid;
    grid-column: 1 / -1;
    align-items: center;
    > * {
      min-width: 0;
    }
  }
  &__header {
    min-height: 20px;
    color: var(--sheetcraft-text-secondary);
  }
  &__row {
    min-height: 28px;
  }
  &__condition-heading {
    grid-column: span 2;
  }
  &__operator,
  &__icon-select {
    width: 64px;
  }
  &__when,
  &__last-bound {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  &__last-bound {
    grid-column: 2 / -1;
  }
  &__no-icon {
    color: var(--sheetcraft-text-secondary);
  }
  &__legacy-value {
    padding-inline: 8px;
  }
}
</style>
