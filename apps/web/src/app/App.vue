<script setup lang="ts">
import { ConfigProvider } from "tdesign-vue-next/es/config-provider";
import type { GlobalConfigProvider } from "tdesign-vue-next/es/config-provider/type";
import enUS from "tdesign-vue-next/es/locale/en_US";
import zhCN from "tdesign-vue-next/es/locale/zh_CN";
import { computed } from "vue";
import { useAppI18n } from "../shared/i18n";
import SpreadsheetWorkspace from "./SpreadsheetWorkspace.vue";

const { locale, t } = useAppI18n();
const tdesignLocale = computed<GlobalConfigProvider>(
  () => (locale.value === "zh-CN" ? zhCN : enUS) as unknown as GlobalConfigProvider,
);
</script>

<template>
  <ConfigProvider :global-config="tdesignLocale">
    <main data-app-root :aria-label="t('app.workspace')" class="app-workspace">
      <SpreadsheetWorkspace />
    </main>
  </ConfigProvider>
</template>

<style scoped lang="scss">
.app-workspace {
  width: 100%;
  min-height: 100dvh;
  background: var(--idea-surface-canvas);
  color: var(--idea-text-primary);
  isolation: isolate;
}
</style>
