<script setup lang="ts">
import { Languages } from "lucide-vue-next";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import type { SelectValue } from "tdesign-vue-next/es/select/type";
import { computed } from "vue";
import { isAppLocale, useAppI18n } from "../shared/i18n";

const { locale, setLocale, t } = useAppI18n();
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
  <label class="locale-switcher">
    <Languages :size="15" aria-hidden="true" />
    <span class="ui-visually-hidden">{{ t("app.language") }}</span>
    <TSelect
      class="locale-switcher__select"
      data-locale-select
      size="small"
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
  height: 34px;
  padding: 0 8px;
  color: var(--ui-text-muted);

  &__select {
    width: 96px;
  }
}
</style>
