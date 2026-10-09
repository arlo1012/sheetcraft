<script setup lang="ts">
import { computed } from "vue";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { InputNumber as TInputNumber } from "tdesign-vue-next/es/input-number";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { Button as TButton } from "tdesign-vue-next/es/button";
import type { CellNumberFormatNegativeStyle, CellStylePatch } from "@sheetcraft/core/style";
import type { SelectionCellStyleState } from "@sheetcraft/core/style-state";
import { useAppI18n } from "../../../shared/i18n";
import { useNumberFormatPanel } from "../number-format/useNumberFormatPanel";
import NumberFormatCategoryList from "./NumberFormatCategoryList.vue";
import OptionList from "../../../shared/option-list/OptionList.vue";

const props = defineProps<{
  state: SelectionCellStyleState;
  patch: CellStylePatch;
  sampleValue: string | number | boolean | null;
  dateSystem?: "1900" | "1904";
}>();
const emit = defineEmits<{
  "update:patch": [patch: CellStylePatch];
  "validity-change": [valid: boolean];
}>();
const { t } = useAppI18n();
const {
  category,
  fractionDigits,
  currency,
  currencyDisplay,
  grouping,
  negativeStyle,
  region,
  selectedCode,
  customCode,
  mixed,
  presets,
  customPresets,
  customValid,
  showDecimals,
  showCurrency,
  showNegative,
  showRegion,
  showTypes,
  description,
  currencyOptions,
  regionOptions,
  negativeOptions,
  preview,
  canDeleteCustom,
  selectCategory,
  selectCode,
  updateCustomCode,
  updateDigits,
  updateCurrency,
  updateRegion,
  updateGrouping,
  updateNegativeStyle,
  deleteCustom,
} = useNumberFormatPanel(
  props,
  (patch) => emit("update:patch", patch),
  (valid) => emit("validity-change", valid),
);
const typeOptions = computed(() =>
  (category.value === "custom" ? customPresets.value : presets.value).map((option) => ({
    ...option,
    value: ("value" in option ? option.value : undefined) ?? option.code,
  })),
);
const previewFillText = computed(() => {
  const character = preview.value.fill?.character;
  return !character || /^\s$/u.test(character) ? "" : character.repeat(256);
});
function selectNegative(code: string): void {
  if (["minus", "red", "parentheses", "red-parentheses"].includes(code))
    updateNegativeStyle(code as CellNumberFormatNegativeStyle);
}
</script>

<template>
  <section class="cell-format-number" :aria-label="t('cellFormat.number')">
    <div class="cell-format-number__body">
      <NumberFormatCategoryList
        :model-value="mixed ? undefined : category"
        @select="selectCategory"
      />
      <div class="cell-format-number__details">
        <div class="cell-format-number__preview">
          <h3 class="cell-format-number__heading">{{ t("cellFormat.preview") }}</h3>
          <output
            class="cell-format-number__sample"
            :style="{ color: preview.color }"
            data-cell-format-number-preview
          >
            <template v-if="preview.fill">
              <span>{{ preview.fill.before }}</span>
              <span class="cell-format-number__sample-fill" aria-hidden="true">{{
                previewFillText
              }}</span>
              <span>{{ preview.fill.after }}</span>
            </template>
            <template v-else>{{ preview.text }}</template>
          </output>
        </div>
        <div v-if="!mixed" class="cell-format-number__settings">
          <div
            v-if="showDecimals"
            class="cell-format-number__field"
            role="group"
            :aria-label="t('cellFormat.decimalPlaces')"
          >
            <span>{{ t("cellFormat.decimalPlaces") }}</span>
            <TInputNumber
              :model-value="fractionDigits"
              :min="0"
              :max="20"
              :decimal-places="0"
              :placeholder="t('cellFormat.decimalPlaces')"
              theme="column"
              class="cell-format-number__digits idea-input-number--persistent-controls"
              data-cell-format-decimals
              @change="updateDigits"
            />
          </div>
          <label v-if="showCurrency" class="cell-format-number__field">
            <span>{{ t("cellFormat.currencyCode") }}</span>
            <TSelect
              :model-value="currency"
              :options="currencyOptions"
              filterable
              :value-display="currencyDisplay"
              :popup-props="{
                overlayClassName: 'idea-number-format-options',
                overlayInnerStyle: { maxHeight: '240px' },
              }"
              data-cell-format-currency
              @change="updateCurrency"
            />
          </label>
          <TCheckbox
            v-if="category === 'number'"
            :model-value="grouping"
            class="cell-format-number__grouping"
            data-cell-format-grouping
            @change="updateGrouping"
            >{{ t("cellFormat.grouping") }}</TCheckbox
          >
          <div v-if="showNegative" class="cell-format-number__negative">
            <span class="cell-format-number__label">{{ t("cellFormat.negativeNumbers") }}</span>
            <OptionList
              class="number-format-types"
              item-data-attribute="data-cell-format-type"
              :model-value="negativeStyle"
              :options="negativeOptions"
              :label="t('cellFormat.negativeNumbers')"
              @select="selectNegative"
            />
          </div>
          <div v-if="showTypes" class="cell-format-number__types">
            <span class="cell-format-number__label">{{ t("cellFormat.type") }}</span>
            <template v-if="category === 'custom'">
              <TInput
                :model-value="customCode"
                :aria-label="t('cellFormat.customCode')"
                :status="customValid ? 'default' : 'error'"
                :maxlength="255"
                data-cell-format-custom-code
                @change="updateCustomCode"
              />
              <p v-if="!customValid" class="cell-format-number__error" role="alert">
                {{ t("cellFormat.invalidFormat") }}
              </p>
            </template>
            <OptionList
              class="number-format-types"
              item-data-attribute="data-cell-format-type"
              :model-value="category === 'custom' ? customCode : selectedCode"
              :options="typeOptions"
              :label="t('cellFormat.type')"
              :monospace="category === 'custom'"
              @select="selectCode"
            />
          </div>
          <label v-if="showRegion" class="cell-format-number__region">
            <span class="cell-format-number__label">{{ t("cellFormat.region") }}</span>
            <TSelect
              :model-value="region"
              :options="regionOptions"
              :filterable="category === 'date' || category === 'time'"
              :popup-props="{
                overlayClassName: 'idea-number-format-options',
                overlayInnerStyle: { maxHeight: '240px' },
              }"
              data-cell-format-region
              @change="updateRegion"
            />
          </label>
          <div v-if="category === 'custom'" class="cell-format-number__custom-actions">
            <TButton
              variant="outline"
              :disabled="!canDeleteCustom"
              data-cell-format-delete-custom
              @click="deleteCustom"
              >{{ t("cellFormat.deleteFormat") }}</TButton
            >
          </div>
        </div>
      </div>
    </div>
    <p class="cell-format-number__description">{{ description }}</p>
  </section>
</template>

<style scoped lang="scss">
.cell-format-number {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  gap: 12px;
  box-sizing: border-box;
  height: 100%;
  min-height: 0;
  color: var(--sheetcraft-text-primary);
  font-size: var(--sheetcraft-font-size-body-medium);
  line-height: var(--sheetcraft-line-height-body-medium);

  &__body {
    display: grid;
    grid-template-columns: 144px minmax(0, 1fr);
    gap: 16px;
    min-height: 0;
  }
  &__details {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
    min-height: 0;
  }
  &__label {
    color: var(--sheetcraft-text-primary);
    font-weight: var(--sheetcraft-font-weight-medium);
    line-height: var(--sheetcraft-line-height-body-medium);
  }
  &__heading {
    margin: 0;
    font-size: inherit;
    font-weight: var(--sheetcraft-font-weight-semibold);
  }
  &__preview {
    display: grid;
    grid-template-rows: auto 40px;
    gap: 8px;
    flex: none;
  }
  &__sample {
    display: flex;
    align-items: center;
    min-width: 0;
    overflow: auto;
    padding: 8px 12px;
    border: 1px solid var(--sheetcraft-border-subtle);
    border-radius: var(--sheetcraft-radius-default);
    color: var(--sheetcraft-text-primary);
    background: var(--sheetcraft-surface-panel);
    font-size: var(--sheetcraft-font-size-body-large);
    font-weight: var(--sheetcraft-font-weight-regular);
    line-height: var(--sheetcraft-line-height-body-large);
    font-variant-numeric: tabular-nums;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  &__settings {
    display: flex;
    flex-direction: column;
    gap: 12px;
    flex: 1;
    min-height: 0;
  }
  &__sample-fill {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
  }
  &__field {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    align-items: center;
    gap: 8px;
    flex: none;
  }
  &__digits {
    max-width: 144px;
  }
  &__grouping {
    align-self: start;
    flex: none;
  }
  &__negative {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 8px;
    min-height: 0;
    max-height: 154px;
  }
  &__types {
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex: 1;
    min-height: 0;
    > .number-format-types {
      flex: 1;
    }
  }
  &__region {
    display: grid;
    gap: 8px;
    flex: none;

    > .cell-format-number__label {
      font-weight: var(--sheetcraft-font-weight-regular);
    }
  }
  &__custom-actions {
    display: flex;
    justify-content: flex-end;
    flex: none;
  }
  &__error {
    margin: 0;
    color: var(--sheetcraft-status-error);
    font-size: var(--sheetcraft-font-size-body-small);
    line-height: var(--sheetcraft-line-height-body-small);
  }
  &__description {
    margin: 0;
    color: var(--sheetcraft-text-secondary);
    font-size: var(--sheetcraft-font-size-body-small);
    line-height: var(--sheetcraft-line-height-body-small);
  }
}
@media (max-width: 480px) {
  .cell-format-number {
    height: auto;
    grid-template-rows: auto auto;
    &__body {
      grid-template-columns: minmax(0, 1fr);
    }
    &__details {
      min-height: 300px;
    }
    &__types {
      min-height: 180px;
    }
    &__field {
      grid-template-columns: minmax(0, 1fr);
      gap: 8px;
    }
  }
}
</style>
