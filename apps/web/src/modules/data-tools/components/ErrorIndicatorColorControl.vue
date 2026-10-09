<script setup lang="ts">
import { ChevronDown } from "lucide-vue-next";
import { computed, nextTick, ref, useId, watch } from "vue";
import ColorPalette from "../../../shared/color/ColorPalette.vue";
import FloatingPanelSurface from "../../../shared/floating/FloatingPanelSurface.vue";
import { useDismissibleFloatingPanel } from "../../../shared/floating/useDismissibleFloatingPanel";

const props = defineProps<{
  label: string;
  automaticLabel: string;
  modelValue: string | null;
  disabled: boolean;
}>();
const emit = defineEmits<{ select: [color: string | null] }>();
const triggerRef = ref<HTMLButtonElement | null>(null);
const panelSurfaceRef = ref<InstanceType<typeof FloatingPanelSurface> | null>(null);
const panelRef = computed(() => panelSurfaceRef.value?.rootElement ?? null);
const open = ref(false);
const panelId = `error-indicator-color-${useId().replaceAll(":", "")}`;
const color = computed(() => props.modelValue ?? "var(--sheetcraft-status-success)");
const valueLabel = computed(() => props.modelValue?.toUpperCase() ?? props.automaticLabel);
const { floatingStyles, dismiss } = useDismissibleFloatingPanel(triggerRef, panelRef, open, {
  offset: 4,
  onDismiss: () => {
    open.value = false;
  },
});

function toggle(): void {
  if (props.disabled) return;
  if (open.value) dismiss("programmatic", true);
  else {
    open.value = true;
    void nextTick(() => panelRef.value?.focus());
  }
}
function select(color: string | null): void {
  if (props.disabled) return;
  emit("select", color);
  dismiss("programmatic", true);
}
function onPanelKeydown(event: KeyboardEvent): void {
  if (event.key !== "Escape") return;
  event.preventDefault();
  event.stopPropagation();
  dismiss("escape", true);
}
watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) dismiss("programmatic", false);
  },
);
</script>

<template>
  <div class="error-indicator-color-control">
    <button
      ref="triggerRef"
      type="button"
      class="error-indicator-color-control__trigger"
      :disabled="disabled"
      :aria-label="label"
      :aria-controls="open ? panelId : undefined"
      :aria-expanded="open"
      aria-haspopup="dialog"
      data-error-indicator-color-trigger
      @click="toggle"
    >
      <span class="error-indicator-color-control__value">
        <span class="error-indicator-color-control__swatch" :style="{ backgroundColor: color }" />
        <span>{{ valueLabel }}</span>
      </span>
      <ChevronDown :size="14" aria-hidden="true" />
    </button>
    <FloatingPanelSurface
      v-if="open"
      :id="panelId"
      ref="panelSurfaceRef"
      class="error-indicator-color-control__panel"
      :style="floatingStyles"
      :label="label"
      viewport-inset="16px"
      layer="context-submenu"
      @keydown="onPanelKeydown"
    >
      <ColorPalette
        :model-value="modelValue"
        default-color="#008a00"
        :default-label="automaticLabel"
        @select="select"
      />
    </FloatingPanelSurface>
  </div>
</template>

<style scoped lang="scss">
.error-indicator-color-control {
  &__trigger {
    display: inline-flex;
    align-items: center;
    gap: var(--sheetcraft-space-2);
    min-width: 136px;
    min-height: 28px;
    justify-content: space-between;
    padding: 0 var(--sheetcraft-space-3);
    color: var(--sheetcraft-text-primary);
    font: inherit;
    background: var(--sheetcraft-surface-panel);
    border: 1px solid var(--sheetcraft-border-control);
    border-radius: var(--sheetcraft-radius-default);
  }
  &__trigger:hover:not(:disabled) {
    background: var(--sheetcraft-surface-hover);
  }

  &__trigger:disabled {
    color: var(--sheetcraft-text-disabled);
    cursor: not-allowed;
  }
  &__value {
    display: inline-flex;
    align-items: center;
    gap: var(--sheetcraft-space-2);
  }
  &__swatch {
    width: 14px;
    height: 14px;
    border: 1px solid var(--sheetcraft-border-control);
    border-radius: var(--sheetcraft-radius-small);
  }
}
</style>
