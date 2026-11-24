<script setup lang="ts">
import { computed, nextTick, ref, useId, watch, type CSSProperties } from "vue";
import type { ThemeColorReference } from "@sheetcraft/core/workbook-theme";
import ColorPalette from "./ColorPalette.vue";
import FloatingPanelSurface from "../floating/FloatingPanelSurface.vue";
import { useDismissibleFloatingPanel } from "../floating/useDismissibleFloatingPanel";
import { useAppI18n } from "../i18n";
import RibbonSplitButton from "../ribbon/RibbonSplitButton.vue";

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    kind: "text" | "fill";
    label: string;
    modelValue?: string | null;
    reference?: ThemeColorReference;
    defaultColor?: string;
    defaultLabel?: string;
    mixed?: boolean;
    disabled?: boolean;
    sessionId?: number;
  }>(),
  {
    modelValue: null,
    reference: undefined,
    defaultColor: "#20242c",
    defaultLabel: undefined,
    mixed: false,
    disabled: false,
    sessionId: undefined,
  },
);

const emit = defineEmits<{
  select: [color: string | null, reference?: ThemeColorReference];
}>();

const { t } = useAppI18n();
const triggerComponentRef = ref<InstanceType<typeof RibbonSplitButton> | null>(null);
const triggerRef = computed(() => triggerComponentRef.value?.menuElement ?? null);
const panelSurfaceRef = ref<InstanceType<typeof FloatingPanelSurface> | null>(null);
const panelRef = computed(() => panelSurfaceRef.value?.rootElement ?? null);
const open = ref(false);
const panelId = `ribbon-color-${useId().replaceAll(":", "")}`;
const { floatingStyles, dismiss } = useDismissibleFloatingPanel(triggerRef, panelRef, open, {
  additionalInside: () => [triggerComponentRef.value?.rootElement],
  onDismiss: () => {
    open.value = false;
  },
});

const indicatorColor = computed(() => props.modelValue ?? props.defaultColor);
const indicatorStyle = computed<CSSProperties>(() => ({
  "--ribbon-color-indicator": indicatorColor.value,
}));
const resolvedDefaultLabel = computed(
  () =>
    props.defaultLabel ?? t(props.kind === "text" ? "cellFormat.automatic" : "cellFormat.noFill"),
);

function closePanel(restoreFocus: boolean): void {
  dismiss("programmatic", restoreFocus);
}

function openPanel(): void {
  if (props.disabled) return;
  open.value = true;
  void nextTick(() => panelRef.value?.focus());
}

function togglePanel(): void {
  if (open.value) closePanel(true);
  else openPanel();
}

function selectColor(color: string | null, reference?: ThemeColorReference): void {
  if (props.disabled) return;
  if (reference) emit("select", color, reference);
  else emit("select", color);
  closePanel(true);
}

function applyCurrentColor(): void {
  if (props.disabled) return;
  if (props.reference) emit("select", props.modelValue, props.reference);
  else emit("select", props.modelValue);
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
    if (disabled) closePanel(false);
  },
);
</script>

<template>
  <span v-bind="$attrs" class="ribbon-color-split" :data-ribbon-color-control="kind">
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
      <span class="ribbon-color-split__icon" :style="indicatorStyle" :data-color-icon="kind">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <g transform="translate(0 -0.5) scale(1 0.9)">
            <path v-if="kind === 'text'" d="m4 17 8-14 8 14M7.5 11h9" />
            <template v-else>
              <path
                d="m8 4 2-2a1 1 0 0 1 1.4 0l8.6 8.6a1 1 0 0 1 0 1.4l-6 6a3 3 0 0 1-4.2 0l-6-6a3 3 0 0 1 0-4.2L6 5.6M5 2l6 6M3 12h16"
              />
            </template>
          </g>
          <rect
            class="ribbon-color-split__indicator"
            x="1.5"
            y="19"
            width="21"
            height="4"
            rx="1.5"
            stroke="none"
            data-color-indicator
          />
        </svg>
      </span>
    </RibbonSplitButton>

    <Teleport to="body">
      <FloatingPanelSurface
        v-if="open"
        :id="panelId"
        ref="panelSurfaceRef"
        class="ribbon-color-split__panel"
        :style="floatingStyles"
        aria-modal="false"
        :label="label"
        layer="context-submenu"
        :data-shape-text-edit-session="sessionId"
      >
        <ColorPalette
          :model-value="modelValue"
          :default-color="defaultColor"
          :default-label="resolvedDefaultLabel"
          :mixed="mixed"
          @select="selectColor"
        />
      </FloatingPanelSurface>
    </Teleport>
  </span>
</template>

<style scoped lang="scss">
@use "../ribbon/ribbon-layout" as ribbon;

.ribbon-color-split {
  @include ribbon.tool;

  &__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--sheetcraft-icon-size, var(--sheetcraft-action-icon-size));
    height: var(--sheetcraft-icon-size, var(--sheetcraft-action-icon-size));

    svg {
      stroke-width: var(--sheetcraft-icon-stroke-width);
    }
  }

  &__indicator {
    fill: var(--ribbon-color-indicator);
  }
}
</style>
