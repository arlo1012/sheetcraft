<script setup lang="ts">
import { ChevronDown } from "lucide-vue-next";
import { nextTick, ref, useId, watch } from "vue";
import ColorPalette from "../../../shared/color/ColorPalette.vue";
import { useDismissibleFloatingPanel } from "../../../shared/floating/useDismissibleFloatingPanel";

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

const triggerRef = ref<HTMLButtonElement | null>(null);
const panelRef = ref<HTMLDivElement | null>(null);
const open = ref(false);
const panelId = `cell-color-picker-${useId().replaceAll(":", "")}`;
const { floatingStyles, dismiss } = useDismissibleFloatingPanel(triggerRef, panelRef, open, {
  onDismiss: () => {
    open.value = false;
  },
});

function closePanel(restoreFocus: boolean): void {
  dismiss("programmatic", restoreFocus);
}

function openPanel(): void {
  if (props.disabled) {
    return;
  }
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

function selectColor(color: string | null): void {
  const defaultColor = props.defaultColor.toLowerCase();
  emit("change", color?.toLowerCase() === defaultColor ? null : color);
  closePanel(true);
}

watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) {
      closePanel(false);
    }
  },
);
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
    <span class="cell-color-picker__icon" aria-hidden="true">
      <slot />
    </span>
    <ChevronDown
      class="cell-color-picker__disclosure"
      :class="{ 'is-expanded': open }"
      :size="10"
      data-color-disclosure
      aria-hidden="true"
    />
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
    >
      <ColorPalette
        :model-value="value ?? null"
        :default-color="defaultColor"
        :mixed="mixed"
        @select="selectColor"
      />
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
    width: var(--cell-format-compact-track, 40px);
    height: var(--cell-format-control-height, 26px);
    gap: 2px;
    padding: 0 3px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--idea-radius-default);
    color: var(--idea-text-primary);
    cursor: pointer;

    &:hover:not(:disabled) {
      background: var(--idea-surface-hover);
    }

    &:focus-visible:not([aria-expanded="true"]) {
      border-color: var(--idea-action-primary);
      outline: none;
      box-shadow: 0 0 0 2px var(--idea-action-focus);
    }

    &[aria-expanded="true"] {
      background: var(--idea-surface-hover);
      border-color: transparent;
      outline: none;
      box-shadow: none;
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.45;
    }
  }

  &__icon {
    display: inline-flex;
    flex: 0 0 18px;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;

    :deep(svg) {
      width: 18px;
      height: 18px;
    }
  }

  &__disclosure {
    flex: 0 0 auto;
    color: var(--idea-text-muted);
    transition: transform 120ms ease;

    &.is-expanded {
      transform: rotate(180deg);
    }
  }

  &__panel {
    z-index: 100;
    max-width: calc(100vw - var(--idea-space-4) - var(--idea-space-4));
    max-height: calc(100vh - var(--idea-space-4) - var(--idea-space-4));
    overflow: auto;
    background: var(--idea-surface-panel);
    border: 1px solid var(--idea-border-control);
    border-radius: var(--idea-radius-medium);
    box-shadow: var(--idea-shadow-floating);

    &:focus-visible {
      outline: 2px solid var(--idea-action-primary);
      outline-offset: 2px;
    }
  }
}
</style>
