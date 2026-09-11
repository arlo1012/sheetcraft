<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from "vue";
import ColorPalette from "../../../shared/color/ColorPalette.vue";
import { useDismissibleFloatingPanel } from "../../../shared/floating/useDismissibleFloatingPanel";
import { useAppI18n } from "../../../shared/i18n";
import RibbonSplitAction from "./RibbonSplitAction.vue";

const props = defineProps<{
  label: string;
  value: string | null;
  defaultColor: string;
  defaultLabel: string;
  disabled: boolean;
}>();

const emit = defineEmits<{
  change: [color: string | null];
}>();

const { t } = useAppI18n();
const triggerComponentRef = ref<InstanceType<typeof RibbonSplitAction> | null>(null);
const triggerRef = computed(() => triggerComponentRef.value?.menuElement ?? null);
const panelRef = ref<HTMLDivElement | null>(null);
const open = ref(false);
const panelId = `cell-color-picker-${useId().replaceAll(":", "")}`;
const { floatingStyles, dismiss } = useDismissibleFloatingPanel(triggerRef, panelRef, open, {
  additionalInside: () => [triggerComponentRef.value?.rootElement],
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
  if (props.disabled) return;
  const defaultColor = props.defaultColor.toLowerCase();
  emit("change", color?.toLowerCase() === defaultColor ? null : color);
  closePanel(true);
}

function applyCurrentColor(): void {
  if (props.disabled) return;
  emit("change", props.value);
  closePanel(false);
}

function onTriggerKeydown(event: KeyboardEvent): void {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  event.preventDefault();
  openPanel();
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
  <RibbonSplitAction
    ref="triggerComponentRef"
    :disabled="disabled"
    :menu-disabled="disabled"
    :label="label"
    :menu-label="t('ribbon.moreOptions', { tool: label })"
    popup-role="dialog"
    :expanded="open"
    :menu-id="panelId"
    @activate="applyCurrentColor"
    @toggle-menu="togglePanel"
    @menu-keydown="onTriggerKeydown"
  >
    <slot />
  </RibbonSplitAction>

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
        :model-value="value"
        :default-color="defaultColor"
        :default-label="defaultLabel"
        @select="selectColor"
      />
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.cell-color-picker {
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
