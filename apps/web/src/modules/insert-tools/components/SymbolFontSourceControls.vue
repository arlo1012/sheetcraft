<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { Button } from "tdesign-vue-next/es/button";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import { Select } from "tdesign-vue-next/es/select";
import { useAppI18n, type MessageKey } from "../../../shared/i18n";
import FontSettingsAction from "../../../shared/cell-text/FontSettingsAction.vue";
import type {
  LocalSymbolFont,
  LocalSymbolFontErrorCode,
} from "../../../shared/cell-text/local-font-source";
import { useLocalSymbolFonts } from "../../../shared/cell-text/local-font-source";
const props = defineProps<{
  loading: boolean;
  defaultFontFamily?: string;
  restoreError?: LocalSymbolFontErrorCode;
}>();
const emit = defineEmits<{ register: [font: LocalSymbolFont, select: boolean] }>();
const { t } = useAppI18n();
const { choices: systemChoices } = useLocalSymbolFonts();
const systemChoice = ref("");
watch(
  systemChoices,
  (choices) => {
    if (systemChoice.value && !choices.some((choice) => choice.id === systemChoice.value))
      systemChoice.value = "";
  },
  { flush: "sync" },
);
const rememberLocalFont = ref(false);
const localSourcesVisible = ref(false);
const localBusy = ref(false);
const localError = ref<LocalSymbolFontErrorCode>();
const localLoaded = ref<false | "session" | "saved">(false);
const operationEmptyMessage = ref<MessageKey>();
const fontFileInput = ref<HTMLInputElement>();
let mounted = true;
onBeforeUnmount(() => {
  mounted = false;
});
watch(
  () => props.restoreError,
  (error) => {
    if (error) {
      localError.value = error;
      localSourcesVisible.value = true;
    }
  },
  { immediate: true },
);
const systemFontOptions = computed(() =>
  systemChoices.value.map((item) => ({ label: item.fullName, value: item.id })),
);
const localErrorMessage = computed<MessageKey | undefined>(() => {
  if (!localError.value) return undefined;
  if (localError.value === "unsupported") return "symbolTools.localUnsupported";
  if (localError.value === "denied" || localError.value === "cancelled")
    return "symbolTools.localDenied";
  if (localError.value === "gesture-required") return "symbolTools.localGesture";
  if (localError.value === "query-failed") return "format.localFontsFailed";
  if (localError.value.startsWith("storage-")) return "symbolTools.localStorageError";
  if (localError.value === "size") return "symbolTools.localSizeError";
  if (localError.value === "font-load") return "symbolTools.fontFailed";
  return "symbolTools.localInvalid";
});
function setLocalError(error: unknown): void {
  localError.value =
    error && typeof error === "object" && "code" in error
      ? (error.code as LocalSymbolFontErrorCode)
      : "malformed";
}
async function loadSelectedLocalFont(): Promise<void> {
  if (!systemChoice.value || localBusy.value) return;
  localBusy.value = true;
  localError.value = undefined;
  localLoaded.value = false;
  operationEmptyMessage.value = undefined;
  try {
    const item = await (
      await import("../../../shared/cell-text/local-font-source")
    ).loadSystemFont(systemChoice.value, { persist: rememberLocalFont.value });
    if (mounted) {
      emit("register", item, true);
      localLoaded.value = item.persisted ? "saved" : "session";
    }
  } catch (error) {
    if (mounted) setLocalError(error);
  } finally {
    if (mounted) localBusy.value = false;
  }
}
function chooseFontFile(): void {
  localSourcesVisible.value = true;
  fontFileInput.value?.click();
}
async function importFontFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file || localBusy.value) return;
  localBusy.value = true;
  localError.value = undefined;
  localLoaded.value = false;
  operationEmptyMessage.value = undefined;
  try {
    const item = await (
      await import("../../../shared/cell-text/local-font-source")
    ).importLocalSymbolFont(file, { persist: rememberLocalFont.value });
    if (mounted) {
      emit("register", item, true);
      localLoaded.value = item.persisted ? "saved" : "session";
    }
  } catch (error) {
    if (mounted) setLocalError(error);
  } finally {
    if (mounted) localBusy.value = false;
  }
}
async function restoreLocalFonts(): Promise<void> {
  if (localBusy.value) return;
  localSourcesVisible.value = true;
  localBusy.value = true;
  localError.value = undefined;
  localLoaded.value = false;
  operationEmptyMessage.value = undefined;
  let source: typeof import("../../../shared/cell-text/local-font-source") | undefined;
  try {
    source = await import("../../../shared/cell-text/local-font-source");
    const items = await source.restoreStoredLocalSymbolFonts();
    if (mounted) {
      for (const item of items) emit("register", item, false);
      localLoaded.value = items.length > 0 ? "saved" : false;
      if (!items.length) operationEmptyMessage.value = "symbolTools.noSavedFonts";
    }
  } catch (error) {
    if (mounted) {
      // A corrupt saved face must not hide other faces that restored successfully.
      for (const item of source?.useLocalSymbolFonts().fonts.value ?? [])
        emit("register", item, false);
      setLocalError(error);
    }
  } finally {
    if (mounted) localBusy.value = false;
  }
}
</script>
<template>
  <div class="symbol-font-sources" role="group" :aria-label="t('symbolTools.localFonts')">
    <div class="symbol-dialog__font-source-actions">
      <FontSettingsAction @open="localSourcesVisible = true" />
      <Button
        theme="default"
        variant="text"
        size="small"
        :disabled="localBusy || loading"
        @click="chooseFontFile"
        >{{ t("symbolTools.importFont") }}</Button
      >
      <Button
        theme="default"
        variant="text"
        size="small"
        :disabled="localBusy || loading"
        @click="restoreLocalFonts"
        >{{ t("symbolTools.restoreFonts") }}</Button
      >
      <input ref="fontFileInput" type="file" accept=".ttf,.otf" hidden @change="importFontFile" />
    </div>
    <section
      v-if="localSourcesVisible || systemChoices.length"
      class="symbol-dialog__font-sources"
      :aria-label="t('symbolTools.localFonts')"
    >
      <Checkbox v-model="rememberLocalFont">{{ t("symbolTools.rememberFont") }}</Checkbox>
      <div v-if="systemChoices.length" class="symbol-dialog__font-source-actions">
        <Select
          v-model="systemChoice"
          :options="systemFontOptions"
          filterable
          :placeholder="t('symbolTools.chooseLocalFont')"
          :disabled="localBusy"
        /><Button
          theme="default"
          variant="base"
          :disabled="!systemChoice || localBusy"
          @click="loadSelectedLocalFont"
          >{{ t("symbolTools.loadLocalFont") }}</Button
        >
      </div>
      <p v-if="operationEmptyMessage" class="symbol-dialog__hint" role="status">
        {{ t(operationEmptyMessage) }}
      </p>
      <p v-if="localBusy" class="symbol-dialog__hint" role="status">
        {{ t("symbolTools.localLoading") }}
      </p>
      <p v-if="localErrorMessage" class="symbol-dialog__hint" role="alert">
        {{ t(localErrorMessage) }}
      </p>
      <p v-if="localLoaded" class="symbol-dialog__hint" role="status">
        {{
          t(
            localLoaded === "saved"
              ? "symbolTools.localRemembered"
              : "symbolTools.localSessionOnly",
          )
        }}
      </p>
    </section>
  </div>
</template>
<style scoped lang="scss">
.symbol-font-sources {
  display: grid;
  gap: 8px;
}
.symbol-dialog {
  &__font-source-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    > :first-child:not(button) {
      flex: 1 1 240px;
      min-width: 0;
    }
  }
  &__font-sources {
    display: grid;
    gap: 8px;
    padding: 10px;
    border: 1px solid var(--sheetcraft-border-default);
    border-radius: 4px;
  }
  &__hint {
    color: var(--sheetcraft-text-secondary);
    font-size: 12px;
    line-height: 18px;
    margin: 0;
    overflow-wrap: anywhere;
  }
}
</style>
