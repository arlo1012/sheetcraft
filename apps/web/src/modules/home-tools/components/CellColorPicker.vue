<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from "vue";
import type { ThemeColorReference } from "@sheetcraft/core/workbook-theme";
import ColorPalette from "../../../shared/color/ColorPalette.vue";
import FloatingPanelSurface from "../../../shared/floating/FloatingPanelSurface.vue";
import { useDismissibleFloatingPanel } from "../../../shared/floating/useDismissibleFloatingPanel";
import { useAppI18n } from "../../../shared/i18n";
import RibbonSplitButton from "../../../shared/ribbon/RibbonSplitButton.vue";

defineOptions({ inheritAttrs: false });

const props = defineProps<{
  label: string;
  value: string | null;
  reference?: ThemeColorReference;
  defaultColor: string;
  defaultLabel: string;
  disabled: boolean;
}>();

const emit = defineEmits<{
  change: [color: string | null, reference?: ThemeColorReference];
}>();

const { t } = useAppI18n();
const triggerComponentRef = ref<InstanceType<typeof RibbonSplitButton> | null>(null);
const triggerRef = computed(() => triggerComponentRef.value?.menuElement ?? null);
const panelSurfaceRef = ref<InstanceType<typeof FloatingPanelSurface> | null>(null);
const panelRef = computed(() => panelSurfaceRef.value?.rootElement ?? null);
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

function selectColor(color: string | null, reference?: ThemeColorReference): void {
  if (props.disabled) return;
  const defaultColor = props.defaultColor.toLowerCase();
  if (reference) emit("change", color, reference);
  else emit("change", color?.toLowerCase() === defaultColor ? null : color);
  closePanel(true);
}

function applyCurrentColor(): void {
  if (props.disabled) return;
  if (props.reference) emit("change", props.value, props.reference);
  else emit("change", props.value);
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
  <span v-bind="$attrs" class="ribbon-menu-tool">
    <RibbonSplitButton
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
    </RibbonSplitButton>

    <Teleport to="body">
      <FloatingPanelSurface
        v-if="open"
        :id="panelId"
        ref="panelSurfaceRef"
        class="cell-color-picker__panel"
        :style="floatingStyles"
        aria-modal="false"
        :label="label"
        layer="context-submenu"
      >
        <ColorPalette
          :model-value="value"
          :default-color="defaultColor"
          :default-label="defaultLabel"
          @select="selectColor"
        />
      </FloatingPanelSurface>
    </Teleport>
  </span>
</template>

<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;

.ribbon-menu-tool {
  @include ribbon.tool;
}

.cell-color-picker {
}
</style>
