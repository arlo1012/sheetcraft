<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import { ChevronDown } from "lucide-vue-next";
import { Popup as TPopup } from "tdesign-vue-next/es/popup";
import ColorPalette from "../../../shared/color/ColorPalette.vue";
import { useAppI18n } from "../../../shared/i18n";

defineProps<{ modelValue: string | undefined; mixed: boolean }>();
const emit = defineEmits<{ select: [color: string | null] }>();
const { t } = useAppI18n();
const open = ref(false);
const triggerRef = ref<HTMLButtonElement>();
const panelRef = ref<{ $el: HTMLElement }>();
function close(): void {
  open.value = false;
  void nextTick(() => triggerRef.value?.focus());
}
function select(color: string | null): void {
  emit("select", color);
  close();
}
function onKeydown(event: KeyboardEvent): void {
  if (event.key !== "Escape") return;
  event.preventDefault();
  event.stopPropagation();
  close();
}
watch(open, (visible) => {
  if (visible)
    void nextTick(() => panelRef.value?.$el.querySelector<HTMLElement>("button")?.focus());
});
</script>

<template>
  <TPopup
    v-model:visible="open"
    trigger="click"
    placement="bottom-left"
    :overlay-inner-style="{ padding: '0' }"
  >
    <button
      ref="triggerRef"
      type="button"
      class="cell-format-font-color"
      :aria-label="t('format.textColor')"
      :aria-expanded="open"
      aria-haspopup="dialog"
      data-cell-format-font-color
    >
      <span v-if="mixed" class="cell-format-font-color__mixed">{{ t("format.mixed") }}</span>
      <span
        v-else
        class="cell-format-font-color__swatch"
        :style="{ backgroundColor: modelValue ?? '#20242c' }"
        aria-hidden="true"
      />
      <ChevronDown :size="14" aria-hidden="true" />
    </button>
    <template #content>
      <div v-if="open" role="dialog" :aria-label="t('format.textColor')" @keydown="onKeydown">
        <ColorPalette
          ref="panelRef"
          :model-value="modelValue ?? null"
          :mixed="mixed"
          default-color="#20242c"
          :default-label="t('cellFormat.automatic')"
          @select="select"
        />
      </div>
    </template>
  </TPopup>
</template>

<style scoped lang="scss">
.cell-format-font-color {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 28px;
  padding: 4px 8px;
  border: 1px solid var(--idea-border-strong);
  border-radius: var(--idea-radius-default);
  background: var(--idea-surface-panel);
  color: var(--idea-text-secondary);
  font: inherit;
  cursor: pointer;

  &__swatch {
    flex: 1;
    height: 16px;
    min-width: 0;
    border-radius: var(--idea-radius-small);
  }
  &__mixed {
    flex: 1;
    text-align: left;
    color: var(--idea-text-muted);
  }
  &:hover {
    border-color: var(--idea-action-primary-hover);
  }
  &:focus-visible {
    outline: 2px solid var(--idea-action-focus);
    border-color: var(--idea-action-primary);
  }
}
</style>
