<script setup lang="ts">
import { ColorPickerPanel } from "tdesign-vue-next/es/color-picker";
import { nextTick, onMounted, ref } from "vue";
import { useAppI18n } from "../i18n";
import { createColorPickerSelectInputProps } from "../tdesign/colorPickerPopup";
import { normalizeColor } from "./palette";

const props = defineProps<{ modelValue: string }>();
const emit = defineEmits<{ apply: [color: string]; back: [] }>();
const { t } = useAppI18n();
const rootRef = ref<HTMLElement | null>(null);
const draftColor = ref(normalizeColor(props.modelValue) ?? "#20242c");
const disabledRecentColors = null as unknown as string[];
const selectInputProps = createColorPickerSelectInputProps(() => rootRef.value ?? document.body);

function updateDraft(value: string, context?: { color?: { hex?: string } }): void {
  const normalized = normalizeColor(context?.color?.hex ?? value);
  if (normalized) draftColor.value = normalized;
}

onMounted(() => {
  void nextTick(() =>
    rootRef.value?.querySelector<HTMLElement>("[role='slider'], input, button")?.focus(),
  );
});
</script>

<template>
  <div ref="rootRef" class="custom-color-panel" @keydown.esc.stop.prevent="emit('back')">
    <ColorPickerPanel
      class="idea-color-palette-panel"
      :model-value="draftColor"
      :color-modes="['monochrome']"
      format="HEX"
      :enable-alpha="false"
      :recent-colors="disabledRecentColors"
      :swatch-colors="[]"
      :show-primary-color-preview="false"
      :select-input-props="selectInputProps"
      @change="updateDraft"
    />
    <div class="custom-color-panel__actions">
      <button type="button" data-color-action="back" @click="emit('back')">
        {{ t("colorPalette.back") }}
      </button>
      <button
        type="button"
        class="custom-color-panel__apply"
        data-color-action="apply"
        @click="emit('apply', draftColor)"
      >
        {{ t("format.applyColor") }}
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.custom-color-panel {
  width: max-content;
  max-width: min(360px, calc(100vw - 32px));
  background: var(--idea-surface-panel);
  color: var(--idea-text-primary);

  &__actions {
    display: flex;
    gap: 6px;
    padding: var(--idea-space-2) var(--idea-tool-panel-padding) var(--idea-tool-panel-padding);

    button {
      flex: 1;
      min-height: 25px;
      border: 1px solid var(--idea-border-control);
      border-radius: 2px;
      background: var(--idea-surface-panel);
      color: inherit;
      font: inherit;
      font-size: var(--idea-font-size-body-medium);
      line-height: var(--idea-line-height-body-medium);
      cursor: pointer;

      &:hover {
        background: var(--idea-surface-hover);
      }
      &:focus-visible {
        outline: 1px solid var(--idea-action-primary);
        outline-offset: 1px;
      }
      &.custom-color-panel__apply {
        border-color: var(--idea-action-primary);
        background: var(--idea-action-primary);
        color: #fff;
      }
    }
  }
}
</style>
