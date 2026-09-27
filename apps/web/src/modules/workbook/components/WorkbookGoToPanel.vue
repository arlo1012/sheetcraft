<script setup lang="ts">
import { ref } from "vue";
import { Button } from "tdesign-vue-next/es/button";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { Radio as TRadio, RadioGroup as TRadioGroup } from "tdesign-vue-next/es/radio";
import type { SheetGoToOptions } from "@idea10/core/go-to";
import { useAppI18n } from "../../../shared/i18n";

type ValueType = "number" | "text" | "logical" | "error";
type GoToKind = SheetGoToOptions["kind"];
const emit = defineEmits<{ goTo: [options: SheetGoToOptions]; close: [] }>();
const { t } = useAppI18n();
const kind = ref<GoToKind>("data");
const constants = ref(true);
const formulas = ref(true);
const valueTypes = ref<ValueType[]>(["number", "text", "logical", "error"]);
const trigger = ref<InstanceType<typeof Button>>();

function setKind(value: GoToKind): void {
  kind.value = value;
}
function toggleValueType(value: ValueType, checked: boolean): void {
  valueTypes.value = checked
    ? [...new Set([...valueTypes.value, value])]
    : valueTypes.value.filter((item) => item !== value);
}
function goTo(): void {
  emit("goTo", {
    kind: kind.value,
    constants: constants.value,
    formulas: formulas.value,
    valueTypes: valueTypes.value,
  });
}
function focus(): void {
  trigger.value?.$el.focus({ preventScroll: true });
}
defineExpose({ focus });
</script>

<template>
  <section class="workbook-go-to-panel" :aria-label="t('navigation.goToTab')">
    <TRadioGroup
      :value="kind"
      class="workbook-go-to-panel__kinds"
      direction="vertical"
      @change="setKind($event as GoToKind)"
    >
      <TRadio value="data" class="workbook-go-to-panel__data">{{
        t("navigation.goToData")
      }}</TRadio>
      <div v-if="kind === 'data'" class="workbook-go-to-panel__data-options">
        <TCheckbox :checked="constants" @change="constants = Boolean($event)">{{
          t("navigation.goToConstants")
        }}</TCheckbox>
        <TCheckbox :checked="formulas" @change="formulas = Boolean($event)">{{
          t("navigation.goToFormulas")
        }}</TCheckbox>
        <div class="workbook-go-to-panel__value-types">
          <TCheckbox
            :checked="valueTypes.includes('number')"
            @change="toggleValueType('number', Boolean($event))"
            >{{ t("navigation.goToNumber") }}</TCheckbox
          >
          <TCheckbox
            :checked="valueTypes.includes('text')"
            @change="toggleValueType('text', Boolean($event))"
            >{{ t("navigation.goToText") }}</TCheckbox
          >
          <TCheckbox
            :checked="valueTypes.includes('logical')"
            @change="toggleValueType('logical', Boolean($event))"
            >{{ t("navigation.goToLogical") }}</TCheckbox
          >
          <TCheckbox
            :checked="valueTypes.includes('error')"
            @change="toggleValueType('error', Boolean($event))"
            >{{ t("navigation.goToError") }}</TCheckbox
          >
        </div>
      </div>
      <TRadio value="blanks">{{ t("navigation.goToBlanks") }}</TRadio>
      <TRadio value="visible">{{ t("navigation.goToVisible") }}</TRadio>
      <TRadio value="last-cell">{{ t("navigation.goToLastCell") }}</TRadio>
      <TRadio value="current-region">{{ t("navigation.goToCurrentRegion") }}</TRadio>
      <TRadio value="objects">{{ t("navigation.goToObjects") }}</TRadio>
      <TRadio value="row-differences">{{ t("navigation.goToRowDifferences") }}</TRadio>
      <TRadio value="column-differences">{{ t("navigation.goToColumnDifferences") }}</TRadio>
      <TRadio value="merged">{{ t("navigation.goToMerged") }}</TRadio>
      <TRadio disabled>{{ t("navigation.goToComments") }}</TRadio>
    </TRadioGroup>
    <div class="workbook-go-to-panel__actions">
      <Button ref="trigger" theme="primary" @click="goTo">{{ t("navigation.goToAction") }}</Button>
      <Button variant="outline" @click="emit('close')">{{ t("navigation.findClose") }}</Button>
    </div>
  </section>
</template>

<style scoped lang="scss">
.workbook-go-to-panel {
  display: grid;
  gap: var(--idea-space-4);
  &__kinds {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--idea-space-3) var(--idea-space-2);
  }
  &__data,
  &__data-options {
    grid-column: 1 / -1;
  }
  &__data-options {
    display: flex;
    flex-wrap: wrap;
    gap: var(--idea-space-3);
    padding-inline-start: var(--idea-space-6);
  }
  &__value-types {
    display: flex;
    flex-wrap: wrap;
    gap: var(--idea-space-3);
    width: 100%;
  }
  &__actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--idea-space-2);
  }
}
@media (max-width: 520px) {
  .workbook-go-to-panel__kinds {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
