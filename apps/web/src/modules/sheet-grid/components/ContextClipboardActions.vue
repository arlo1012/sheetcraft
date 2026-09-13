<script setup lang="ts">
import { Clipboard, ClipboardPaste, Copy, Scissors, Stamp } from "lucide-vue-next";
import { useAppI18n } from "../../../shared/i18n";
import RibbonButton from "../../../shared/ribbon/RibbonButton.vue";

const props = withDefaults(
  defineProps<{
    readOnly?: boolean;
    cutDisabledReason?: string;
    pasteSpecialDisabled?: boolean;
    pasteFormatsDisabled?: boolean;
  }>(),
  {
    readOnly: false,
    cutDisabledReason: undefined,
    pasteSpecialDisabled: false,
    pasteFormatsDisabled: false,
  },
);

const emit = defineEmits<{
  cut: [];
  copy: [];
  paste: [];
  pasteValues: [];
  pasteFormats: [];
}>();

const { t } = useAppI18n();
</script>

<template>
  <div
    class="context-clipboard-actions"
    role="group"
    :aria-label="t('contextMenu.clipboardActions')"
    data-context-clipboard-actions
  >
    <RibbonButton
      :label="t('cellMenu.copy')"
      data-context-clipboard-action="copy"
      @activate="emit('copy')"
    >
      <Copy :size="17" aria-hidden="true" />
    </RibbonButton>
    <RibbonButton
      :label="t('cellMenu.cut')"
      :disabled="readOnly || Boolean(cutDisabledReason)"
      :title="cutDisabledReason ?? t('cellMenu.cut')"
      :aria-description="cutDisabledReason"
      data-context-clipboard-action="cut"
      @activate="emit('cut')"
    >
      <Scissors :size="17" aria-hidden="true" />
    </RibbonButton>
    <RibbonButton
      :label="t('cellMenu.paste')"
      :disabled="readOnly"
      data-context-clipboard-action="paste"
      @activate="emit('paste')"
    >
      <ClipboardPaste :size="17" aria-hidden="true" />
    </RibbonButton>
    <RibbonButton
      :label="t('cellMenu.pasteValues')"
      :disabled="readOnly || pasteSpecialDisabled"
      data-context-clipboard-action="paste-values"
      @activate="emit('pasteValues')"
    >
      <Clipboard :size="17" aria-hidden="true" />
    </RibbonButton>
    <RibbonButton
      :label="t('cellMenu.pasteFormats')"
      :disabled="readOnly || pasteSpecialDisabled || pasteFormatsDisabled"
      data-context-clipboard-action="paste-formats"
      @activate="emit('pasteFormats')"
    >
      <Stamp :size="17" aria-hidden="true" />
    </RibbonButton>
  </div>
</template>

<style scoped lang="scss">
.context-clipboard-actions {
  display: flex;
  gap: 2px;
  align-items: center;
  min-height: 28px;
  padding: 0 2px;
  background: var(--idea-surface-panel);
  border-bottom: 1px solid var(--idea-border-subtle);
  border-radius: var(--idea-radius-default) var(--idea-radius-default) 0 0;

  :deep(.ribbon-button) {
    width: 28px;
    height: 28px;
  }
}
</style>
