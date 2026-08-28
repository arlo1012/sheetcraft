<script setup lang="ts">
import { Button as TButton } from "tdesign-vue-next/es/button";
import { ColorPickerPanel } from "tdesign-vue-next/es/color-picker";
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  useId,
  watch,
  type CSSProperties,
} from "vue";
import { useFloatingPanel } from "../../../shared/floating/useFloatingPanel";
import { useAppI18n } from "../../../shared/i18n";

const SWATCH_COLORS = [
  "#ffffff",
  "#f3f4f6",
  "#d1d5db",
  "#6b7280",
  "#20242c",
  "#fee2e2",
  "#fecaca",
  "#ef4444",
  "#991b1b",
  "#ffedd5",
  "#fed7aa",
  "#f97316",
  "#9a3412",
  "#fef3c7",
  "#fde68a",
  "#eab308",
  "#854d0e",
  "#dcfce7",
  "#bbf7d0",
  "#22c55e",
  "#166534",
  "#dbeafe",
  "#bfdbfe",
  "#3b82f6",
  "#1e40af",
  "#ede9fe",
  "#ddd6fe",
  "#8b5cf6",
  "#5b21b6",
] as const;

// TDesign handles null as disabled, but its Vue runtime prop narrows the public type to arrays.
const DISABLED_RECENT_COLORS = null as unknown as string[];

const props = defineProps<{
  label: string;
  value: string | undefined;
  defaultColor: string;
  mixed: boolean;
  disabled: boolean;
}>();

const emit = defineEmits<{
  change: [color: string | null];
}>();

const { t } = useAppI18n();
const triggerRef = ref<HTMLButtonElement | null>(null);
const panelRef = ref<HTMLDivElement | null>(null);
const open = ref(false);
const draftColor = ref(props.value ?? props.defaultColor);
const panelId = `cell-color-picker-${useId().replaceAll(":", "")}`;
const currentColor = computed(() => props.value ?? props.defaultColor);
const swatchStyle = computed<CSSProperties>(() => ({ backgroundColor: currentColor.value }));
const { floatingStyles } = useFloatingPanel(triggerRef, panelRef, open);

function normalizeColor(color: string): string | undefined {
  const normalized = color.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : undefined;
}

function closePanel(restoreFocus: boolean): void {
  open.value = false;
  if (restoreFocus) {
    void nextTick(() => triggerRef.value?.focus());
  }
}

function openPanel(): void {
  if (props.disabled) {
    return;
  }
  draftColor.value = currentColor.value;
  open.value = true;
  void nextTick(() => panelRef.value?.focus());
}

function togglePanel(): void {
  if (open.value) {
    closePanel(true);
  } else {
    openPanel();
  }
}

function updateDraft(color: string): void {
  const normalized = normalizeColor(color);
  if (normalized) {
    draftColor.value = normalized;
  }
}

function applyColor(): void {
  const color = normalizeColor(draftColor.value);
  if (!color) {
    return;
  }
  emit("change", color === props.defaultColor.toLowerCase() ? null : color);
  closePanel(true);
}

function resetColor(): void {
  emit("change", null);
  closePanel(true);
}

function onDocumentPointerDown(event: PointerEvent): void {
  const target = event.target as Node;
  if (!open.value || triggerRef.value?.contains(target) || panelRef.value?.contains(target)) {
    return;
  }
  closePanel(false);
}

function onPanelKeydown(event: KeyboardEvent): void {
  if (event.key !== "Escape") {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  closePanel(true);
}

watch(currentColor, (color) => {
  if (!open.value) {
    draftColor.value = color;
  }
});

watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) {
      closePanel(false);
    }
  },
);

onMounted(() => document.addEventListener("pointerdown", onDocumentPointerDown));
onBeforeUnmount(() => document.removeEventListener("pointerdown", onDocumentPointerDown));
</script>

<template>
  <button
    ref="triggerRef"
    type="button"
    class="cell-color-picker__trigger"
    :class="{ 'is-mixed': mixed }"
    :disabled="disabled"
    :aria-label="label"
    :title="label"
    aria-haspopup="dialog"
    :aria-expanded="open"
    :aria-controls="open ? panelId : undefined"
    @click="togglePanel"
  >
    <slot />
    <span class="cell-color-picker__swatch" :style="swatchStyle" aria-hidden="true" />
  </button>

  <Teleport to="body">
    <div
      v-if="open"
      :id="panelId"
      ref="panelRef"
      class="cell-color-picker__panel"
      :style="floatingStyles"
      role="dialog"
      aria-modal="false"
      :aria-label="label"
      tabindex="-1"
      @keydown="onPanelKeydown"
    >
      <ColorPickerPanel
        :model-value="draftColor"
        :color-modes="['monochrome']"
        format="HEX"
        :enable-alpha="false"
        :recent-colors="DISABLED_RECENT_COLORS"
        :show-primary-color-preview="false"
        :swatch-colors="[...SWATCH_COLORS]"
        @change="updateDraft"
      />
      <div class="cell-color-picker__actions">
        <TButton
          type="button"
          variant="text"
          size="small"
          data-color-action="reset"
          @click="resetColor"
        >
          {{ t("format.resetColor") }}
        </TButton>
        <span aria-hidden="true" />
        <TButton
          type="button"
          variant="outline"
          size="small"
          data-color-action="cancel"
          @click="closePanel(true)"
        >
          {{ t("format.cancelColor") }}
        </TButton>
        <TButton
          type="button"
          theme="primary"
          size="small"
          data-color-action="apply"
          @click="applyColor"
        >
          {{ t("format.applyColor") }}
        </TButton>
      </div>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.cell-color-picker {
  &__trigger {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 28px;
    padding: 0;
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--td-radius-default);
    color: var(--td-text-color-primary);
    cursor: pointer;

    &:hover:not(:disabled) {
      background: var(--td-bg-color-container-hover);
    }

    &:focus-visible,
    &[aria-expanded="true"] {
      border-color: var(--td-brand-color);
      outline: none;
      box-shadow: 0 0 0 2px var(--td-brand-color-focus);
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.45;
    }
  }

  &__swatch {
    position: absolute;
    right: 6px;
    bottom: 3px;
    left: 6px;
    height: 3px;
    border: 1px solid rgb(32 36 44 / 22%);
  }

  &__trigger.is-mixed &__swatch {
    background: transparent !important;
    border-color: var(--td-text-color-placeholder);
    border-style: dashed;
  }

  &__panel {
    z-index: 100;
    max-width: calc(100vw - var(--td-size-4) - var(--td-size-4));
    max-height: calc(100vh - var(--td-size-4) - var(--td-size-4));
    overflow: auto;
    background: var(--td-bg-color-container);
    border: 1px solid var(--td-component-border);
    border-radius: var(--td-radius-medium);
    box-shadow: var(--td-shadow-2);

    &:focus-visible {
      outline: 2px solid var(--td-brand-color);
      outline-offset: 2px;
    }
  }

  &__actions {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 6px;
    padding: 8px;
    border-top: 1px solid var(--td-border-level-1-color);
  }
}
</style>
