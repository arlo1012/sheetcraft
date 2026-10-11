<script setup lang="ts">
import { computed, ref } from "vue";
import { SlidersHorizontal, Ungroup } from "lucide-vue-next";
import {
  useFloatingPanel,
  type FloatingReference,
} from "../../../shared/floating/useFloatingPanel";
import { useAppI18n } from "../../../shared/i18n";
const props = defineProps<{
  anchor: FloatingReference;
  disabled?: boolean;
  canUngroup?: boolean;
}>();
const emit = defineEmits<{ ungroup: []; format: []; dismiss: [] }>();
const { t } = useAppI18n();
const toolbarRef = ref<HTMLElement | null>(null);
const { floatingStyles } = useFloatingPanel(
  computed(() => props.anchor),
  toolbarRef,
  computed(() => true),
  { placement: "right-start", offset: 12 },
);
function onKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    event.preventDefault();
    emit("dismiss");
    return;
  }
  if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
  const buttons = Array.from(
    toolbarRef.value?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [],
  );
  if (!buttons.length) return;
  event.preventDefault();
  const index = buttons.indexOf(event.target as HTMLButtonElement);
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? buttons.length - 1
        : (index + (event.key === "ArrowUp" ? -1 : 1) + buttons.length) % buttons.length;
  buttons[next]?.focus();
}
</script>
<template>
  <Teleport to="body">
    <div
      ref="toolbarRef"
      class="sheet-picture-group-toolbar"
      :style="floatingStyles"
      role="toolbar"
      :aria-label="t('picture.quickActions')"
      data-picture-group-toolbar
      @pointerdown.stop
      @click.stop
      @keydown.stop="onKeydown"
    >
      <button
        v-if="canUngroup"
        type="button"
        :disabled="disabled"
        :aria-label="t('picture.ungroup')"
        :title="t('picture.ungroup')"
        data-picture-group-action="ungroup"
        @click="emit('ungroup')"
      >
        <Ungroup />
      </button>
      <button
        type="button"
        :disabled="disabled"
        :aria-label="t('pictureFormat.paneTitle')"
        :title="t('pictureFormat.paneTitle')"
        data-picture-group-action="format"
        @click="emit('format')"
      >
        <SlidersHorizontal />
      </button>
    </div>
  </Teleport>
</template>
<style scoped lang="scss">
@use "../../../shared/floating/floating-panel" as panel;
.sheet-picture-group-toolbar {
  @include panel.toolbar-surface(var(--sheetcraft-layer-toolbar));
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px;
  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 4px;
    border: 1px solid transparent;
    border-radius: 4px;
    background: transparent;
    color: var(--sheetcraft-text-primary);
    cursor: pointer;
    &:hover:not(:disabled) {
      background: var(--sheetcraft-icon-button-hover-bg);
    }
    &:disabled {
      opacity: 0.45;
      cursor: default;
    }
    svg {
      width: 16px;
      height: 16px;
    }
  }
}
</style>
