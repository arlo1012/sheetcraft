<script setup lang="ts">
import { computed } from "vue";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Dialog as TDialog } from "tdesign-vue-next/es/dialog";
import { Form as TForm, FormItem as TFormItem } from "tdesign-vue-next/es/form";
import { useAppI18n } from "../i18n";
import { localFontAccess } from "./local-fonts";
import { fontSettingsVisible } from "./font-settings";

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
</script>

<template>
  <TDialog
    v-if="fontSettingsVisible"
    v-model:visible="fontSettingsVisible"
    :header="t('format.fontSettings')"
    width="min(440px, calc(100vw - 32px))"
    placement="center"
    :footer="false"
  >
    <TForm class="sheetcraft-form-grid" label-align="top">
      <TFormItem :label="t('format.localFonts')">
        <div class="font-settings" data-local-font-access>
          <TButton
            theme="primary"
            variant="base"
            :loading="loading"
            :disabled="availability !== 'available'"
            @click="load({ refresh: true })"
            >{{
              t(status === "loaded" ? "format.localFontsRefresh" : "format.localFontsAction")
            }}</TButton
          >
          <p role="status">{{ message }}</p>
          <p>{{ t("format.fontFallbackHint") }}</p>
        </div>
      </TFormItem>
    </TForm>
  </TDialog>
</template>

<style scoped lang="scss">
.font-settings {
  display: grid;
  justify-items: start;
  gap: 8px;
  width: 100%;
  min-width: 0;
  padding-top: 2px;

  p {
    margin: 0;
    color: var(--sheetcraft-text-secondary);
    font-size: var(--sheetcraft-font-size-body-small);
    line-height: var(--sheetcraft-line-height-body-small);
  }
}
</style>
