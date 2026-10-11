<script setup lang="ts">
import { computed } from "vue";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Info } from "lucide-vue-next";
import { useAppI18n } from "../i18n";
import { localFontAccess } from "./local-fonts";

const { t } = useAppI18n();
const { availability, loading, status, families, load } = localFontAccess;
const message = computed(() => {
  if (availability.value === "insecure") return t("format.localFontsInsecure");
  if (availability.value === "unsupported") return t("format.localFontsUnsupported");
  if (status.value === "denied") return t("format.localFontsDenied");
  if (status.value === "failed") return t("format.localFontsFailed");
  if (status.value === "empty") return t("format.localFontsEmpty");
  if (status.value === "loaded")
    return t("format.localFontsLoaded", { count: families.value.length });
  return t("format.localFontsHint");
});
const description = computed(() => `${message.value}\n${t("format.fontFallbackHint")}`);
</script>

<template>
  <div class="local-font-access" data-local-font-access>
    <TButton
      size="small"
      variant="text"
      theme="default"
      :loading="loading"
      :disabled="availability !== 'available'"
      @click="load"
      >{{
        t(status === "loaded" ? "format.localFontsRefresh" : "format.localFontsAction")
      }}</TButton
    >
    <span
      class="local-font-access__info"
      role="img"
      tabindex="0"
      :title="description"
      :aria-label="description"
      ><Info aria-hidden="true"
    /></span>
    <span class="ui-visually-hidden" role="status">{{ message }}</span>
  </div>
</template>

<style scoped lang="scss">
.local-font-access {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 14px 4px 6px;
  border-top: 1px solid var(--sheetcraft-border-subtle);
  min-width: 0;
  &__info {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    color: var(--sheetcraft-text-secondary);
    cursor: help;

    svg {
      width: var(--sheetcraft-action-icon-size);
      height: var(--sheetcraft-action-icon-size);
      stroke-width: var(--sheetcraft-icon-stroke-width);
    }
  }
}
</style>
