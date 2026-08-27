<script setup lang="ts">
import { Languages } from "lucide-vue-next";
import { isAppLocale, useAppI18n } from "../shared/i18n";

const { locale, setLocale, t } = useAppI18n();

function onLocaleChange(event: Event): void {
  const locale = (event.target as HTMLSelectElement).value;
  if (isAppLocale(locale)) {
    setLocale(locale);
  }
}
</script>

<template>
  <label class="locale-switcher">
    <Languages :size="15" aria-hidden="true" />
    <select :value="locale" :aria-label="t('app.language')" @change="onLocaleChange">
      <option value="zh-CN">{{ t("app.localeChinese") }}</option>
      <option value="en-US">{{ t("app.localeEnglish") }}</option>
    </select>
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

  select {
    height: 26px;
    padding: 0 22px 0 6px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 3px;
    color: var(--ui-text-secondary);
    font-size: 12px;
    letter-spacing: 0;
    cursor: pointer;

    &:hover,
    &:focus-visible {
      background: var(--ui-surface-primary);
      border-color: var(--ui-border-default);
      outline: none;
    }
  }
}
</style>
