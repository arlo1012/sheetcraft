<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import { Input } from "tdesign-vue-next/es/input";
import { Select } from "tdesign-vue-next/es/select";
import { RadioGroup } from "tdesign-vue-next/es/radio";
import {
  datePartsToExcelSerial,
  excelSerialToDateParts,
  type ExcelDateSystem,
} from "@sheetcraft/core/formula";
import {
  getPivotGroupLabels,
  type PivotFieldGroup,
  type PivotDateGroupUnit,
} from "@sheetcraft/core/pivot-tables";
import type { PivotGroupingDraft } from "../usePivotGrouping";
import { useAppI18n } from "../../../shared/i18n";
const props = defineProps<{
  draft: PivotGroupingDraft;
  dateSystem: ExcelDateSystem;
  disabled?: boolean;
}>();
const emit = defineEmits<{ apply: [group: PivotFieldGroup]; close: [] }>();
const { t, locale } = useAppI18n();
const root = ref<HTMLElement>();
const popupProps = { attach: () => root.value ?? document.body };
const kind = ref<"number" | "date">("number");
const start = ref("");
const end = ref("");
const interval = ref("1");
const autoStart = ref(false);
const autoEnd = ref(false);
const unit = ref<PivotDateGroupUnit>("months");
const dateText = (serial: number) => {
  const p = excelSerialToDateParts(serial, props.dateSystem);
  return `${String(p.year).padStart(4, "0")}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
};
const parseDate = (text: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text.trim());
  if (!m) throw new RangeError("Invalid date.");
  return datePartsToExcelSerial(
    {
      year: Number(m[1]),
      month: Number(m[2]),
      day: Number(m[3]),
      hour: 0,
      minute: 0,
      second: 0,
      millisecond: 0,
    },
    props.dateSystem,
  );
};
function reset(): void {
  const initial = props.draft.initial;
  kind.value = initial.kind;
  autoStart.value = initial.autoStart ?? false;
  autoEnd.value = initial.autoEnd ?? false;
  unit.value = initial.kind === "date" ? initial.unit : "months";
  start.value = initial.kind === "date" ? dateText(initial.start) : String(initial.start);
  end.value = initial.kind === "date" ? dateText(initial.end) : String(initial.end);
  interval.value = String(initial.interval);
}
watch(() => props.draft, reset, { immediate: true });
function changeKind(value: string | number | boolean): void {
  const next = value === "date" ? "date" : "number";
  const initial = props.draft.initial;
  kind.value = next;
  if (next === "date") {
    try {
      start.value = dateText(initial.start);
      end.value = dateText(initial.end);
    } catch {
      start.value = "";
      end.value = "";
    }
    interval.value = "1";
  } else {
    start.value = String(initial.start);
    end.value = String(initial.end);
    interval.value = String(initial.interval);
  }
}
const group = computed<PivotFieldGroup | undefined>(() => {
  try {
    if (
      (!autoStart.value && !start.value.trim()) ||
      (!autoEnd.value && !end.value.trim()) ||
      !interval.value.trim()
    )
      return;
    const from = autoStart.value
      ? (props.draft.min ?? props.draft.initial.start)
      : kind.value === "date"
        ? parseDate(start.value)
        : Number(start.value);
    const to = autoEnd.value
      ? (props.draft.max ?? props.draft.initial.end)
      : kind.value === "date"
        ? parseDate(end.value) + 1 - 1 / 86400000
        : Number(end.value);
    const step = kind.value === "date" && unit.value !== "days" ? 1 : Number(interval.value);
    if (
      !Number.isFinite(from) ||
      !Number.isFinite(to) ||
      from > to ||
      !Number.isFinite(step) ||
      step <= 0 ||
      (kind.value === "date" && !Number.isInteger(step))
    )
      return;
    const value: PivotFieldGroup =
      kind.value === "date"
        ? {
            field: props.draft.field,
            kind: "date",
            unit: unit.value,
            start: from,
            end: to,
            interval: step,
          }
        : { field: props.draft.field, kind: "number", start: from, end: to, interval: step };
    if (autoStart.value) value.autoStart = true;
    if (autoEnd.value) value.autoEnd = true;
    const labels = getPivotGroupLabels(value, props.dateSystem);
    if (value.kind === "date" && value.unit === "months") {
      const formatter = new Intl.DateTimeFormat(locale.value, { month: "short", timeZone: "UTC" });
      for (let month = 0; month < 12; month++)
        labels[month + 1] = formatter.format(new Date(Date.UTC(2000, month, 1)));
      value.labels = labels;
    }
    return value;
  } catch {
    return;
  }
});
function apply(): void {
  if (group.value && !props.disabled) emit("apply", group.value);
}
</script>
<template>
  <Dialog
    :visible="true"
    :header="t('pivot.groupTitle', { field: draft.name })"
    width="min(400px, calc(100vw - 32px))"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    :confirm-btn="{ content: t('dataTools.common.confirm'), disabled: !group || disabled }"
    :cancel-btn="t('dataTools.common.cancel')"
    @confirm="apply"
    @close="emit('close')"
  >
    <div ref="root" class="pivot-group-dialog">
      <RadioGroup
        :value="kind"
        :disabled="disabled"
        :options="[
          { value: 'number', label: t('pivot.groupNumbers') },
          { value: 'date', label: t('pivot.groupDates') },
        ]"
        @change="changeKind"
      />
      <div class="pivot-group-dialog__row">
        <span>{{ t("pivot.groupStart") }}</span>
        <div class="pivot-group-dialog__bound">
          <Checkbox v-model="autoStart" :disabled="disabled">{{
            t("pivot.groupAutomatic")
          }}</Checkbox>
          <label>
            <span class="ui-visually-hidden">{{ t("pivot.groupStart") }}</span>
            <Input
              v-model="start"
              :placeholder="kind === 'date' ? 'YYYY-MM-DD' : ''"
              :disabled="disabled || autoStart"
            />
          </label>
        </div>
      </div>
      <div class="pivot-group-dialog__row">
        <span>{{ t("pivot.groupEnd") }}</span>
        <div class="pivot-group-dialog__bound">
          <Checkbox v-model="autoEnd" :disabled="disabled">{{
            t("pivot.groupAutomatic")
          }}</Checkbox>
          <label>
            <span class="ui-visually-hidden">{{ t("pivot.groupEnd") }}</span>
            <Input
              v-model="end"
              :placeholder="kind === 'date' ? 'YYYY-MM-DD' : ''"
              :disabled="disabled || autoEnd"
            />
          </label>
        </div>
      </div>
      <label v-if="kind === 'date'" class="pivot-group-dialog__row">
        <span>{{ t("pivot.groupUnit") }}</span>
        <Select
          v-model="unit"
          :disabled="disabled"
          :popup-props="popupProps"
          :options="[
            { value: 'years', label: t('pivot.groupYears') },
            { value: 'quarters', label: t('pivot.groupQuarters') },
            { value: 'months', label: t('pivot.groupMonths') },
            { value: 'days', label: t('pivot.groupDays') },
            { value: 'hours', label: t('pivot.groupHours') },
            { value: 'minutes', label: t('pivot.groupMinutes') },
            { value: 'seconds', label: t('pivot.groupSeconds') },
          ]"
        />
      </label>
      <label v-if="kind === 'number' || unit === 'days'" class="pivot-group-dialog__row">
        <span>{{ t("pivot.groupInterval") }}</span>
        <Input v-model="interval" :disabled="disabled" />
      </label>
      <p v-if="!group" role="status">{{ t("pivot.groupInvalid") }}</p>
    </div>
  </Dialog>
</template>
<style scoped lang="scss">
.pivot-group-dialog {
  display: flex;
  flex-direction: column;
  gap: 14px;
  &__bound {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  &__row {
    display: grid;
    grid-template-columns: 80px minmax(0, 1fr);
    align-items: center;
    gap: 12px;
  }
  p {
    margin: 0;
    color: var(--td-error-color);
  }
}
</style>
