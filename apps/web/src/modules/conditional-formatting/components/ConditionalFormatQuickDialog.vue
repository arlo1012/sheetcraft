<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Form as TForm, FormItem as TFormItem } from "tdesign-vue-next/es/form";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { InputNumber as TInputNumber } from "tdesign-vue-next/es/input-number";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import {
  normalizeConditionalFormatRules,
  type ConditionalFormatCondition,
  type ConditionalFormatDatePeriod,
  type ConditionalFormatStyle,
  type SheetConditionalFormatRule,
} from "@idea10/core/conditional-formatting";
import { useAppI18n, type MessageKey } from "../../../shared/i18n";
import {
  createConditionalFormatRuleId,
  parseConditionalFormatRanges,
} from "../conditional-formatting-ui";
import {
  conditionalFormatPresetStyle,
  type ConditionalFormatQuickDialogKind,
} from "../conditional-format-quick-rules";
import ConditionalFormatStyleSelect from "./ConditionalFormatStyleSelect.vue";

const props = defineProps<{
  kind: ConditionalFormatQuickDialogKind;
  ranges: string;
  sampleValue?: string | number | boolean | null;
  dateSystem?: "1900" | "1904";
}>();
const emit = defineEmits<{ save: [rule: SheetConditionalFormatRule]; close: [] }>();
const { t } = useAppI18n();
const value = ref("");
const secondValue = ref("");
const count = ref(10);
const unique = ref(false);
const datePeriod = ref<ConditionalFormatDatePeriod>("yesterday");
const format = ref<ConditionalFormatStyle>(conditionalFormatPresetStyle("redFillText"));
const customVisible = ref(false);
const error = ref("");
const isRank = computed(() =>
  ["top10Items", "top10Percent", "bottom10Items", "bottom10Percent"].includes(props.kind),
);
const isAverage = computed(() => props.kind === "aboveAverage" || props.kind === "belowAverage");
const isPercent = computed(() => props.kind === "top10Percent" || props.kind === "bottom10Percent");
const title = computed(() =>
  t(`conditionalFormatting.${props.kind === "date" ? "dateOccurring" : props.kind}` as MessageKey),
);
const instruction = computed(() =>
  t(
    `conditionalFormatting.quick${props.kind[0]!.toUpperCase()}${props.kind.slice(1)}` as MessageKey,
  ),
);
const dateOptions = computed(() =>
  (
    [
      "yesterday",
      "today",
      "tomorrow",
      "last7Days",
      "lastWeek",
      "thisWeek",
      "nextWeek",
      "lastMonth",
      "thisMonth",
      "nextMonth",
    ] as const
  ).map((value) => ({ value, label: t(`conditionalFormatting.${value}`) })),
);
function operand(text: string): number | string {
  return Number.isFinite(Number(text.trim())) ? Number(text.trim()) : text;
}
function save() {
  error.value = "";
  const ranges = parseConditionalFormatRanges(props.ranges);
  if (!ranges) {
    error.value = t("conditionalFormatting.invalidRange");
    return;
  }
  let condition: ConditionalFormatCondition;
  if (isRank.value) {
    if (
      !Number.isInteger(count.value) ||
      count.value < 1 ||
      count.value > (isPercent.value ? 100 : 1000)
    ) {
      error.value = t("conditionalFormatting.invalidCount");
      return;
    }
    condition = {
      kind: "rank",
      count: count.value,
      ...(isPercent.value ? { percent: true } : {}),
      ...(props.kind.startsWith("bottom") ? { bottom: true } : {}),
    };
  } else if (isAverage.value) condition = { kind: "average", above: props.kind === "aboveAverage" };
  else if (props.kind === "duplicate") condition = { kind: "duplicate", unique: unique.value };
  else if (props.kind === "date") condition = { kind: "date", period: datePeriod.value };
  else {
    if (!value.value.trim() || (props.kind === "between" && !secondValue.value.trim())) {
      error.value = t("conditionalFormatting.invalidValue");
      return;
    }
    condition =
      props.kind === "contains"
        ? { kind: "text", operator: "contains", text: value.value }
        : {
            kind: "cellValue",
            operator: props.kind as "greaterThan" | "lessThan" | "equal" | "between",
            value: operand(value.value),
            ...(props.kind === "between" ? { secondValue: operand(secondValue.value) } : {}),
          };
  }
  try {
    emit(
      "save",
      normalizeConditionalFormatRules([
        {
          id: createConditionalFormatRuleId(),
          ranges,
          anchor: { ...ranges[0]!.start },
          condition,
          style: format.value,
        },
      ])[0]!,
    );
  } catch {
    error.value = t("conditionalFormatting.invalidFormat");
  }
}
watch(
  () => props.kind,
  () => {
    value.value = "";
    secondValue.value = "";
    count.value = 10;
    unique.value = false;
    datePeriod.value = "yesterday";
    format.value = conditionalFormatPresetStyle("redFillText");
    error.value = "";
  },
);
</script>

<template>
  <Dialog
    role="dialog"
    aria-modal="true"
    :aria-label="title"
    :visible="!customVisible"
    :header="title"
    :confirm-btn="t('conditionalFormatting.save')"
    :cancel-btn="t('conditionalFormatting.cancel')"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    :width="`min(${isAverage ? 360 : isRank ? 420 : kind === 'between' ? 600 : 480}px, calc(100vw - 32px))`"
    placement="center"
    @confirm="save"
    @close="emit('close')"
  >
    <TForm class="conditional-format-quick" layout="vertical" :label-width="0">
      <p class="conditional-format-quick__instruction">{{ instruction }}</p>
      <p v-if="isAverage" class="conditional-format-quick__scope">
        {{ t("conditionalFormatting.quickSelection") }}
      </p>
      <div
        class="conditional-format-quick__row"
        :class="{
          'conditional-format-quick__row--average': isAverage,
          'conditional-format-quick__row--rank': isRank,
          'conditional-format-quick__row--between': kind === 'between',
        }"
      >
        <TFormItem v-if="isRank" role="group" :aria-label="t('conditionalFormatting.count')">
          <TInputNumber
            v-model="count"
            :aria-label="t('conditionalFormatting.count')"
            theme="column"
            class="idea-input-number--persistent-controls"
            :min="1"
            :max="isPercent ? 100 : 1000"
            :decimal-places="0"
          />
          <span v-if="isPercent" class="conditional-format-quick__unit">%</span>
        </TFormItem>
        <TFormItem
          v-else-if="kind === 'date'"
          role="group"
          :aria-label="t('conditionalFormatting.datePeriod')"
        >
          <TSelect
            v-model="datePeriod"
            :aria-label="t('conditionalFormatting.datePeriod')"
            :options="dateOptions"
          />
        </TFormItem>
        <TFormItem
          v-else-if="kind === 'duplicate'"
          role="group"
          :aria-label="t('conditionalFormatting.condition')"
        >
          <TSelect
            v-model="unique"
            :aria-label="t('conditionalFormatting.condition')"
            :options="[
              { value: false, label: t('conditionalFormatting.duplicate') },
              { value: true, label: t('conditionalFormatting.unique') },
            ]"
          />
        </TFormItem>
        <TFormItem
          v-else-if="!isAverage"
          role="group"
          :aria-label="t('conditionalFormatting.value')"
        >
          <TInput
            v-model="value"
            :aria-label="t('conditionalFormatting.value')"
            autofocus
            @enter="save"
          />
        </TFormItem>
        <template v-if="kind === 'between'">
          <span>{{ t("conditionalFormatting.and") }}</span>
          <TFormItem role="group" :aria-label="t('conditionalFormatting.secondValue')"
            ><TInput
              v-model="secondValue"
              :aria-label="t('conditionalFormatting.secondValue')"
              @enter="save"
          /></TFormItem>
        </template>
        <span v-if="!isAverage">{{ t("conditionalFormatting.setFormat") }}</span>
        <TFormItem
          class="conditional-format-quick__format"
          role="group"
          :aria-label="t('conditionalFormatting.setFormat')"
        >
          <ConditionalFormatStyleSelect
            v-model="format"
            :sample-value="sampleValue"
            :date-system="dateSystem"
            @custom-visible="customVisible = $event"
          />
        </TFormItem>
      </div>
      <p v-if="error" role="alert" class="conditional-format-quick__error">{{ error }}</p>
    </TForm>
  </Dialog>
</template>

<style scoped lang="scss">
.conditional-format-quick {
  display: grid;
  gap: 8px;
  &__instruction,
  &__scope {
    margin: 0;
  }
  &__row {
    display: grid;
    grid-template-columns: minmax(80px, 1fr) auto minmax(180px, 1fr);
    align-items: center;
    gap: 8px;
    > * {
      min-width: 0;
    }
    &--rank {
      grid-template-columns: 96px auto minmax(180px, 1fr);
    }
    &--average {
      grid-template-columns: minmax(0, 1fr);
    }
    &--between {
      grid-template-columns: minmax(60px, 1fr) auto minmax(60px, 1fr) auto minmax(180px, 1.5fr);
    }
    @media (max-width: 540px) {
      &--between {
        grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
      }
      &--between > .conditional-format-quick__format {
        grid-column: span 2;
      }
    }
  }
  &__unit {
    margin-left: 4px;
  }
  &__error {
    margin: 0;
    color: var(--idea-status-error);
  }
}
</style>
