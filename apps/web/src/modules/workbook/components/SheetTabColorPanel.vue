<script setup lang="ts">
import ColorPalette from "../../../shared/color/ColorPalette.vue";
import { computed, nextTick, ref, toRef, watch } from "vue";
import { useDismissibleFloatingPanel } from "../../../shared/floating/useDismissibleFloatingPanel";
import { useAppI18n } from "../../../shared/i18n";

const props = defineProps<{ anchor: HTMLElement | null; open: boolean; value?: string }>();
const emit = defineEmits<{
  apply: [value: string | null];
  close: [
    reason: "escape" | "outside-pointer" | "outside-focus" | "programmatic",
    restoreFocus: boolean,
  ];
}>();
const { t } = useAppI18n();
const panelRef = ref<HTMLElement | null>(null);
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
    <div
      v-if="open"
      ref="panelRef"
      class="sheet-tab-color-panel"
      :style="floatingStyles"
      role="dialog"
      :aria-label="t('sheetTabs.tabColorAction')"
      tabindex="-1"
      @keydown="onKeydown"
    >
      <ColorPalette
        :model-value="value"
        default-color="#ffffff"
        :default-label="t('format.resetColor')"
        @select="apply"
      />
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.sheet-tab-color-panel {
  z-index: 90;
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
</style>
