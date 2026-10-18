<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from "vue";
import { TriangleAlert } from "lucide-vue-next";
import { Button as TButton } from "tdesign-vue-next/es/button";
import FloatingPanelSurface from "../../../shared/floating/FloatingPanelSurface.vue";
import { useFloatingPanel } from "../../../shared/floating/useFloatingPanel";
import { useDismissibleFloatingPanel } from "../../../shared/floating/useDismissibleFloatingPanel";
import { vIconAction } from "../../../shared/focus/icon-action";
import { useAppI18n } from "../../../shared/i18n";
import { chartNoticeButtonPosition } from "../chart-preview-notices";
const props = defineProps<{ anchor: HTMLElement | null; messages: string[]; retry?: boolean }>();
const emit = defineEmits<{ retry: [] }>();
const { t } = useAppI18n();
const id = `chart-notices-${useId()}`;
const button = ref<HTMLElement | null>(null);
const panel = ref<InstanceType<typeof FloatingPanelSurface> | null>(null);
const panelElement = computed(() => panel.value?.rootElement ?? null);
const open = ref(false);
const visible = ref(true);

const active = computed(() => !!props.anchor && !!props.messages.length && visible.value);
const anchor = computed(() => props.anchor);
const buttonPosition = useFloatingPanel(anchor, button, active, {
  placement: "right-start",
  offset: 4,
  avoidReferenceOverlap: true,
});
const buttonStyle = computed(() => {
  const element = props.anchor;
  if (!element) return {};
  const viewport = element.ownerDocument.defaultView;
  const rect = element.getBoundingClientRect();
  const clip = buttonPosition.middlewareData.value.referenceClip as
    | { x: number; y: number; width: number; height: number }
    | undefined;
  const left = Math.max(rect.left, clip?.x ?? -Infinity),
    top = Math.max(rect.top, clip?.y ?? -Infinity);
  const visibleBounds = {
    x: left,
    y: top,
    width: Math.max(0, Math.min(rect.right, clip ? clip.x + clip.width : Infinity) - left),
    height: Math.max(0, Math.min(rect.bottom, clip ? clip.y + clip.height : Infinity) - top),
  };
  const placement = chartNoticeButtonPosition(
    visibleBounds,
    { x: buttonPosition.x.value, y: buttonPosition.y.value },
    { width: viewport?.innerWidth ?? 0, height: viewport?.innerHeight ?? 0 },
  );
  return { position: "fixed" as const, left: `${placement.x}px`, top: `${placement.y}px` };
});
// The user explicitly opens this panel. Usual viewport-constrained popover
// placement may overlap content when no exterior space exists; it never opens itself.
const { floatingStyles, dismiss } = useDismissibleFloatingPanel(button, panelElement, open, {
  placement: "right-start",
  offset: 4,
  onDismiss: () => {
    open.value = false;
  },
});
async function toggle() {
  if (open.value) {
    dismiss("programmatic", true);
    return;
  }
  open.value = true;
  await nextTick();
  panelElement.value?.focus();
}
let visibilityObserver: IntersectionObserver | undefined;
watch(
  anchor,
  (element) => {
    visibilityObserver?.disconnect();
    visible.value = true;
    if (element && typeof IntersectionObserver !== "undefined") {
      visibilityObserver = new IntersectionObserver(([entry]) => {
        visible.value = entry?.isIntersecting ?? false;
      });
      visibilityObserver.observe(element);
    }
  },
  { immediate: true, flush: "post" },
);
watch(active, (value) => {
  if (!value) open.value = false;
});
onBeforeUnmount(() => visibilityObserver?.disconnect());
</script>
<template>
  <span :id="`${id}-description`" class="ui-visually-hidden" role="status">{{
    messages.join(" ")
  }}</span>
  <Teleport to="body">
    <div
      v-if="active"
      :id="`${id}-button`"
      ref="button"
      v-icon-action
      class="chart-preview-notices__button"
      :style="buttonStyle"
      :aria-label="t('chart.previewNotices')"
      :aria-describedby="`${id}-description`"
      :aria-controls="id"
      :aria-expanded="open"
      aria-haspopup="dialog"
      @pointerdown.stop
      @dblclick.stop
      @click.stop="toggle"
    >
      <TriangleAlert :size="16" aria-hidden="true" />
    </div>
    <FloatingPanelSurface
      v-if="active && open"
      :id="id"
      ref="panel"
      :label="t('chart.previewNotices')"
      padding="tool"
      layer="popover"
      class="chart-preview-notices__panel"
      :style="floatingStyles"
      @pointerdown.stop
      @dblclick.stop
    >
      <p v-for="(message, index) in messages" :key="index" class="chart-preview-notices__message">
        {{ message }}
      </p>
      <div class="chart-preview-notices__actions">
        <TButton v-if="retry" size="small" @click="emit('retry')">{{
          t("chart.formatFontRetry")
        }}</TButton>
        <TButton size="small" @click="dismiss('programmatic', true)">{{
          t("chart.formatClose")
        }}</TButton>
      </div>
    </FloatingPanelSurface>
  </Teleport>
</template>
<style scoped lang="scss">
.chart-preview-notices {
  &__button {
    width: 24px;
    height: 24px;
    z-index: var(--sheetcraft-layer-popover);
    color: var(--sheetcraft-text-warning, #a16207);
  }
  &__panel {
    width: min(320px, calc(100vw - 16px));
  }
  &__message {
    margin: 0 0 8px;
    font-size: 12px;
    line-height: 18px;
  }
  &__actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }
}
</style>
