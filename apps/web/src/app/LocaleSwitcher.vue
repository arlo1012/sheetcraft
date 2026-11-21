<script setup lang="ts">
import { Languages } from "lucide-vue-next";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import type { SelectValue } from "tdesign-vue-next/es/select/type";
import { computed, useId } from "vue";
import { isAppLocale, useAppI18n } from "../shared/i18n";
import { vNativeControl } from "../shared/tdesign/native-control";

const { locale, setLocale, t } = useAppI18n();
const localeSelectId = `locale-switcher-${useId()}`;
const localeOptions = computed(() => [
  { label: t("app.localeChinese"), value: "zh-CN" },
  { label: t("app.localeEnglish"), value: "en-US" },
]);

function onLocaleChange(value: SelectValue): void {
  if (typeof value === "string" && isAppLocale(value)) {
    setLocale(value);
  }
}
</script>

<template>
  <label :for="localeSelectId" class="locale-switcher">
    <Languages :size="15" aria-hidden="true" />
    <span class="ui-visually-hidden">{{ t("app.language") }}</span>
    <TSelect
      v-native-control="{
        attributes: {
          id: localeSelectId,
          name: 'workbook-locale',
          'aria-label': t('app.language'),
        },
      }"
      class="locale-switcher__select"
      data-locale-select
      borderless
      :model-value="locale"
      :options="localeOptions"
      @change="onLocaleChange"
    />
  </label>
</template>

<style scoped lang="scss">
.locale-switcher {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 4px;
  height: 30px;
  padding: 0 6px;
  color: var(--sheetcraft-text-muted);

  &__select {
    width: 112px;
  }
}
</style>
