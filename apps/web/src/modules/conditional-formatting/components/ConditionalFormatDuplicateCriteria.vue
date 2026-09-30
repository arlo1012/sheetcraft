<script setup lang="ts">
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { useAppI18n } from "../../../shared/i18n";

const unique = defineModel<boolean>("unique", { required: true });
const { t } = useAppI18n();
</script>

<template>
  <div
    class="duplicate-criteria"
    role="group"
    :aria-label="t('conditionalFormatting.duplicateDescription')"
  >
    <TSelect
      v-model="unique"
      :aria-label="t('conditionalFormatting.condition')"
      :options="[
        { value: false, label: t('conditionalFormatting.duplicateChoice') },
        { value: true, label: t('conditionalFormatting.uniqueChoice') },
      ]"
    />
    <span>{{ t("conditionalFormatting.duplicateScope") }}</span>
  </div>
</template>

<style scoped lang="scss">
.duplicate-criteria {
  display: grid;
  grid-template-columns: minmax(0, 180px) minmax(0, 1fr);
  align-items: center;
  gap: 8px;
}
</style>
