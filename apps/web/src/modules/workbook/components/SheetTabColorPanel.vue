<script setup lang="ts">
import ColorPalette from "../../../shared/color/ColorPalette.vue";
import FloatingPanelSurface from "../../../shared/floating/FloatingPanelSurface.vue";
import { computed, nextTick, ref, toRef, watch } from "vue";
import { useDismissibleFloatingPanel } from "../../../shared/floating/useDismissibleFloatingPanel";
import { useAppI18n } from "../../../shared/i18n";

const props = defineProps<{
  anchor: HTMLElement | null;
  open: boolean;
  value?: string;
}>();
const emit = defineEmits<{
  apply: [value: string | null];
  close: [
    reason: "escape" | "outside-pointer" | "outside-focus" | "programmatic",
    restoreFocus: boolean,
  ];
}>();
const { t } = useAppI18n();
const panelSurfaceRef = ref<InstanceType<typeof FloatingPanelSurface> | null>(null);
const panelRef = computed(() => panelSurfaceRef.value?.rootElement ?? null);
const panelOpen = toRef(props, "open");
const anchorRef = computed(() => props.anchor);
const { floatingStyles, dismiss } = useDismissibleFloatingPanel(anchorRef, panelRef, panelOpen, {
  placement: "top-start",
  offset: 4,
  onDismiss: ({ reason, restoreFocus }) => emit("close", reason, restoreFocus),
});

function apply(color: string | null): void {
  emit("apply", color?.toUpperCase() ?? null);
}

function onKeydown(event: KeyboardEvent): void {
  event.stopPropagation();
  if (event.key === "Escape") {
    event.preventDefault();
    dismiss("escape", true);
  }
}

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    void nextTick(() => panelRef.value?.focus());
  },
);

defineExpose({ dismiss, rootElement: panelRef });
</script>

<template>
  <Teleport to="body">
    <FloatingPanelSurface
      v-if="open"
      ref="panelSurfaceRef"
      class="sheet-tab-color-panel"
      :style="floatingStyles"
      :label="t('sheetTabs.tabColorAction')"
      layer="toolbar"
      @keydown="onKeydown"
    >
      <ColorPalette
        :model-value="value"
        default-color="#ffffff"
        :default-label="t('format.resetColor')"
        @select="apply"
      />
    </FloatingPanelSurface>
  </Teleport>
</template>
