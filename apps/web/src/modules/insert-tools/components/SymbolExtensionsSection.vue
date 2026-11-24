<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from "vue";
import { vNativeControl } from "../../../shared/tdesign/native-control";
import { FormItem } from "tdesign-vue-next/es/form";
import { Input } from "tdesign-vue-next/es/input";
import FormatSection from "../../../shared/format-pane/FormatSection.vue";
import { useAppI18n } from "../../../shared/i18n";
import SymbolFontSourceControls from "./SymbolFontSourceControls.vue";
import type { SymbolUnicodeCatalog } from "../symbols/unicode-catalog";
import type { SymbolFont } from "../symbols/symbol-fonts";
import type { SymbolInsertion } from "../symbols/symbol-preferences";
import type {
  LocalSymbolFont,
  LocalSymbolFontErrorCode,
} from "../../../shared/cell-text/local-font-source";

const props = defineProps<{
  tab: string;
  loading: boolean;
  defaultFontFamily?: string;
  fontRestoreError?: LocalSymbolFontErrorCode;
  catalog?: SymbolUnicodeCatalog;
  allUnicode: boolean;
  font?: SymbolFont;
  pointsCount: number;
  current?: SymbolInsertion;
  previewFontFamily?: string;
  currentCode: string;
  currentName: string;
  currentAliases: string;
  currentMetadata: string;
  localFontLabels: Readonly<Record<string, string>>;
  literal: string;
}>();

const emit = defineEmits<{
  register: [item: LocalSymbolFont];
  "update:literal": [value: string];
  literalChange: [];
  insert: [];
}>();

const { t } = useAppI18n();
const extensionsWrap = ref<HTMLElement>();
const extensionsOpen = ref(false);
let mounted = true;
let extensionsScrollTimer: ReturnType<typeof setTimeout> | undefined;

function clearExtensionsScrollTimer(): void {
  if (extensionsScrollTimer !== undefined) {
    clearTimeout(extensionsScrollTimer);
    extensionsScrollTimer = undefined;
  }
}

onBeforeUnmount(() => {
  mounted = false;
  clearExtensionsScrollTimer();
});

watch(
  () => props.fontRestoreError,
  (error) => {
    if (error) extensionsOpen.value = true;
  },
  { immediate: true },
);

watch(extensionsOpen, (open) => {
  clearExtensionsScrollTimer();
  if (open) {
    const reveal = () =>
      extensionsWrap.value?.scrollIntoView?.({ behavior: "smooth", block: "end" });
    void nextTick(reveal);
    extensionsScrollTimer = setTimeout(() => {
      extensionsScrollTimer = undefined;
      if (mounted && extensionsOpen.value) reveal();
    }, 240);
  }
});
</script>

<template>
  <div ref="extensionsWrap" class="symbol-dialog__extensions">
    <FormatSection v-model:open="extensionsOpen" :title="t('symbolTools.options')">
      <div class="symbol-dialog__extension-content">
        <SymbolFontSourceControls
          v-show="tab === 'symbols'"
          :loading="loading"
          :default-font-family="defaultFontFamily"
          :restore-error="fontRestoreError"
          @register="emit('register', $event)"
        />
        <div v-if="catalog && !allUnicode && font" class="symbol-dialog__hint">
          {{
            t(font.source === "local" ? "symbolTools.localCoverage" : "symbolTools.coverage", {
              count: pointsCount,
              version: catalog.version,
            })
          }}
        </div>
        <div class="symbol-dialog__preview" :aria-label="t('symbolTools.preview')">
          <span class="symbol-dialog__preview-glyph" :style="{ fontFamily: previewFontFamily }">{{
            current ? (/^\s+$/u.test(current.text) ? "␣" : current.text) : "—"
          }}</span>
          <div>
            <strong>{{ current ? currentCode : t("symbolTools.noSelection") }}</strong
            ><span>{{ currentName }}</span
            ><span v-if="currentAliases">{{ currentAliases }}</span
            ><span v-if="currentMetadata">{{ currentMetadata }}</span
            ><span>{{
              current?.fontFamily
                ? (localFontLabels[current.fontFamily] ?? current.fontFamily)
                : t("symbolTools.inherited")
            }}</span>
          </div>
        </div>
        <div v-show="tab === 'symbols'">
          <FormItem
            class="symbol-dialog__literal symbol-dialog__field"
            :label="t('symbolTools.literal')"
            ><Input
              v-native-control="{ attributes: { 'aria-label': t('symbolTools.literal') } }"
              :model-value="literal"
              :maxlength="16"
              :placeholder="t('symbolTools.literalHint')"
              @update:model-value="emit('update:literal', String($event))"
              @change="emit('literalChange')"
              @enter="emit('insert')"
          /></FormItem>
        </div>
        <p v-if="tab === 'special'" class="symbol-dialog__hint">
          {{ t("symbolTools.specialNote") }}
        </p>
      </div>
    </FormatSection>
  </div>
</template>

<style scoped lang="scss">
.symbol-dialog {
  &__field {
    min-width: 0;
  }
  &__hint {
    color: var(--sheetcraft-text-secondary);
    font-size: var(--sheetcraft-font-size-body-small);
    line-height: var(--sheetcraft-line-height-body-small);
    margin: 0;
    overflow-wrap: anywhere;
  }
  &__preview {
    display: flex;
    gap: 12px;
    align-items: center;
    min-width: 0;
    border-top: 1px solid var(--sheetcraft-border-subtle);
    padding-top: 10px;
    > div {
      display: flex;
      flex-direction: column;
      min-width: 0;
      > span {
        overflow-wrap: anywhere;
        color: var(--sheetcraft-text-secondary);
        font-size: var(--sheetcraft-font-size-body-small);
        line-height: var(--sheetcraft-line-height-body-small);
      }
    }
    strong {
      font-weight: 500;
      overflow-wrap: anywhere;
    }
  }
  &__preview-glyph {
    flex: 0 0 58px;
    max-width: 100px;
    text-align: center;
    font-size: 32px;
    line-height: 42px;
    overflow: hidden;
  }
  &__extensions {
    flex: 0 0 auto;
    min-width: 0;
    border-top: 1px solid var(--sheetcraft-border-divider);
  }
  &__extension-content {
    display: grid;
    gap: 8px;
    padding: 10px 12px;
    border-radius: var(--sheetcraft-radius-dialog-card);
    background: var(--sheetcraft-surface-dialog-card);
  }
}
</style>
