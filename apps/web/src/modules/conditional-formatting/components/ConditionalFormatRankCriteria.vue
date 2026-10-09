<script setup lang="ts">
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { InputNumber as TInputNumber } from "tdesign-vue-next/es/input-number";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { useAppI18n } from "../../../shared/i18n";

defineProps<{ error?: string }>();
const bottom = defineModel<boolean>("bottom", { required: true });
const count = defineModel<number>("count", { required: true });
const percent = defineModel<boolean>("percent", { required: true });
const { t } = useAppI18n();
</script>

<template>
  <div class="rank-criteria">
    <div
      class="rank-criteria__row"
      role="group"
      :aria-label="t('conditionalFormatting.rankDescription')"
    >
      <TSelect
        v-model="bottom"
        :aria-label="t('conditionalFormatting.rank')"
        :options="[
          { value: false, label: t('conditionalFormatting.top') },
          { value: true, label: t('conditionalFormatting.bottom') },
        ]"
      />
      <TInputNumber
        v-model="count"
        class="idea-input-number--persistent-controls"
        theme="column"
        :aria-label="t('conditionalFormatting.count')"
        :min="1"
        :max="percent ? 100 : 1000"
        :decimal-places="0"
      />
      <TCheckbox v-model="percent">{{ t("conditionalFormatting.rankPercent") }}</TCheckbox>
    </div>
    <p v-if="error" class="rank-criteria__error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped lang="scss">
.rank-criteria {
  display: grid;
  gap: 8px;
  &__row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    > * {
      min-width: 0;
    }
    .idea-input-number--persistent-controls {
      width: 100%;
    }
    @media (max-width: 560px) {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      > :last-child {
        grid-column: 1 / -1;
      }
    }
  }
  &__error {
    margin: 0;
    color: var(--sheetcraft-status-error);
  }
}
</style>
