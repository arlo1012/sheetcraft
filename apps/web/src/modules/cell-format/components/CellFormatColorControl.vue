<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import { ChevronDown } from "lucide-vue-next";
import { Popup as TPopup } from "tdesign-vue-next/es/popup";
import ColorPalette from "../../../shared/color/ColorPalette.vue";
import { useAppI18n } from "../../../shared/i18n";

withDefaults(
  defineProps<{
    modelValue?: string;
    label: string;
    defaultColor?: string;
    mixed?: boolean;
    disabled?: boolean;
  }>(),
  { defaultColor: "#000000", mixed: false, disabled: false },
);
const emit = defineEmits<{ select: [color: string] }>();
const { t } = useAppI18n();
const open = ref(false);
const trigger = ref<HTMLButtonElement>();
const palette = ref<{ $el: HTMLElement }>();
function close(): void {
  open.value = false;
  void nextTick(() => trigger.value?.focus());
}
function onKeydown(event: KeyboardEvent): void {
  if (event.key !== "Escape") return;
  event.preventDefault();
  event.stopPropagation();
  close();
}
watch(open, (value) => {
  if (value) void nextTick(() => palette.value?.$el.querySelector<HTMLElement>("button")?.focus());
});
</script>

<template>
  <div class="cell-format-color-control">
    <TPopup
      v-model:visible="open"
      :disabled="disabled"
      trigger="click"
      placement="bottom-left"
      :overlay-inner-style="{ padding: '0' }"
    >
      <button
        ref="trigger"
        type="button"
        class="cell-format-color-control__trigger"
        :disabled="disabled"
        :aria-label="label"
        :aria-expanded="open"
        aria-haspopup="dialog"
      >
        <span v-if="mixed" class="cell-format-color-control__label">{{ t("format.mixed") }}</span>
        <span v-else-if="disabled" class="cell-format-color-control__label">{{
          t("cellFormat.patternNone")
        }}</span>
        <span
          v-else
          class="cell-format-color-control__swatch"
          :style="{ backgroundColor: modelValue ?? defaultColor }"
          aria-hidden="true"
        />
        <ChevronDown :size="14" aria-hidden="true" />
      </button>
      <template #content>
        <div v-if="open" role="dialog" :aria-label="label" @keydown="onKeydown">
          <ColorPalette
            ref="palette"
            :model-value="modelValue ?? defaultColor"
            :default-color="defaultColor"
            :default-label="t('cellFormat.automatic')"
            :mixed="mixed"
            @select="
              (color) => {
                emit('select', color ?? defaultColor);
                close();
              }
            "
          />
        </div>
      </template>
    </TPopup>
  </div>
</template>

<style scoped lang="scss">
.cell-format-color-control {
  min-width: 0;
  &__trigger {
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
    &:hover:not(:disabled) {
      border-color: var(--idea-action-primary-hover);
    }
    &:focus-visible {
      outline: 2px solid var(--idea-action-focus);
    }
    &:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
  }
  &__swatch,
  &__label {
    flex: 1;
    min-width: 0;
  }
  &__swatch {
    height: 16px;
    border-radius: var(--idea-radius-small);
  }
  &__label {
    text-align: center;
  }
}
</style>
