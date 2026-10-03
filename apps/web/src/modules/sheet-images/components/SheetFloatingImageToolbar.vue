<script setup lang="ts">
import { Check, ChevronDown, Crop, RotateCcw, RotateCw, X } from "lucide-vue-next";
import { computed, nextTick, ref, useId, watch } from "vue";
import { useDismissibleFloatingPanel } from "../../../shared/floating/useDismissibleFloatingPanel";
import {
  useFloatingPanel,
  type FloatingReference,
} from "../../../shared/floating/useFloatingPanel";
import { useAppI18n } from "../../../shared/i18n";
import { vIconAction } from "../../../shared/focus/icon-action";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";

const props = withDefaults(
  defineProps<{
    anchor: FloatingReference;
    cropping: boolean;
    canRestore: boolean;
    disabled?: boolean;
  }>(),
  { disabled: false },
);
const emit = defineEmits<{
  crop: [];
  rotate: [quarterTurns: -1 | 1 | 2];
  flip: [axis: "vertical" | "horizontal"];
  restore: [];
  applyCrop: [];
  cancelCrop: [];
}>();

const { t } = useAppI18n();
const toolbarRef = ref<HTMLElement | null>(null);
const toolbarAnchor = computed(() => props.anchor);
const toolbarOpen = computed(() => true);
const rotateTriggerRef = ref<HTMLElement | null>(null);
const rotateMenuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const rotateMenuRef = computed<HTMLElement | null>(
  () => rotateMenuSurfaceRef.value?.rootElement ?? null,
);
const rotateMenuOpen = ref(false);
const rotateMenuId = `floating-image-rotate-menu-${useId().replaceAll(":", "")}`;
const { floatingStyles: toolbarStyles } = useFloatingPanel(toolbarAnchor, toolbarRef, toolbarOpen, {
  placement: "top-start",
  offset: 10,
});
const { floatingStyles: rotateMenuStyles, dismiss: dismissRotateMenu } =
  useDismissibleFloatingPanel(rotateTriggerRef, rotateMenuRef, rotateMenuOpen, {
    offset: 4,
    onDismiss: () => {
      rotateMenuOpen.value = false;
    },
  });

function stopGridEvent(event: Event): void {
  event.stopPropagation();
}

function onToolbarKeydown(event: KeyboardEvent): void {
  event.stopPropagation();
  if (event.key === "Escape" && props.cropping) {
    event.preventDefault();
    emit("cancelCrop");
  }
}

function openRotateMenu(focus: "first" | "last" = "first"): void {
  if (props.disabled || props.cropping) return;
  rotateMenuOpen.value = true;
  void nextTick(() =>
    focus === "last"
      ? rotateMenuSurfaceRef.value?.focusLastItem()
      : rotateMenuSurfaceRef.value?.focusFirstItem(),
  );
}

function toggleRotateMenu(): void {
  if (rotateMenuOpen.value) dismissRotateMenu("programmatic", true);
  else openRotateMenu();
}

function onRotateTriggerKeydown(event: KeyboardEvent): void {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  event.preventDefault();
  openRotateMenu(event.key === "ArrowDown" ? "first" : "last");
}

function rotate(quarterTurns: -1 | 1 | 2): void {
  dismissRotateMenu("programmatic", true);
  emit("rotate", quarterTurns);
}

function flip(axis: "vertical" | "horizontal"): void {
  dismissRotateMenu("programmatic", true);
  emit("flip", axis);
}

function onRotateMenuKeydown(event: KeyboardEvent): void {
  event.stopPropagation();
  if (event.key === "Escape") {
    event.preventDefault();
    dismissRotateMenu("escape", true);
  }
}

watch(
  () => [props.disabled, props.cropping],
  ([disabled, cropping]) => {
    if (disabled || cropping) dismissRotateMenu("programmatic", false);
  },
);
</script>

<template>
  <Teleport to="body">
    <div
      ref="toolbarRef"
      class="sheet-floating-image-toolbar"
      :style="toolbarStyles"
      role="toolbar"
      :aria-label="t('image.contextMenuActions')"
      @pointerdown="stopGridEvent"
      @click="stopGridEvent"
      @keydown="onToolbarKeydown"
    >
      <template v-if="cropping">
        <span
          v-icon-action="disabled"
          class="sheet-floating-image-toolbar__action"
          :aria-label="t('image.applyCrop')"
          :title="t('image.applyCrop')"
          data-floating-image-toolbar-action="apply-crop"
          @click="emit('applyCrop')"
        >
          <Check :size="16" aria-hidden="true" />
        </span>
        <span
          v-icon-action="disabled"
          class="sheet-floating-image-toolbar__action"
          :aria-label="t('image.cancelCrop')"
          :title="t('image.cancelCrop')"
          data-floating-image-toolbar-action="cancel-crop"
          @click="emit('cancelCrop')"
        >
          <X :size="16" aria-hidden="true" />
        </span>
      </template>
      <template v-else>
        <span
          v-icon-action="disabled"
          class="sheet-floating-image-toolbar__action"
          :aria-label="t('image.crop')"
          :title="t('image.crop')"
          data-floating-image-toolbar-action="crop"
          @click="emit('crop')"
        >
          <Crop :size="16" aria-hidden="true" />
        </span>
        <span
          ref="rotateTriggerRef"
          v-icon-action="disabled"
          class="sheet-floating-image-toolbar__action sheet-floating-image-toolbar__rotate"
          :aria-label="t('image.rotate')"
          :title="t('image.rotate')"
          aria-haspopup="menu"
          :aria-expanded="rotateMenuOpen"
          :aria-controls="rotateMenuOpen ? rotateMenuId : undefined"
          data-floating-image-toolbar-action="rotate"
          @click="toggleRotateMenu"
          @keydown="onRotateTriggerKeydown"
        >
          <RotateCw :size="16" aria-hidden="true" />
          <ChevronDown :size="11" aria-hidden="true" />
        </span>
        <span
          v-icon-action="disabled || !canRestore"
          class="sheet-floating-image-toolbar__action"
          :aria-label="t('image.restoreOriginal')"
          :title="t('image.restoreOriginal')"
          data-floating-image-toolbar-action="restore"
          @click="emit('restore')"
        >
          <RotateCcw :size="16" aria-hidden="true" />
        </span>
      </template>
    </div>
  </Teleport>

  <Teleport to="body">
    <MenuSurface
      v-if="rotateMenuOpen"
      :id="rotateMenuId"
      ref="rotateMenuSurfaceRef"
      class="sheet-floating-image-toolbar__rotate-menu"
      :style="rotateMenuStyles"
      :label="t('image.rotate')"
      @pointerdown.stop
      @click.stop
      @keydown="onRotateMenuKeydown"
    >
      <MenuItem data-floating-image-rotate="left" @select="rotate(-1)">
        {{ t("image.rotateLeft") }}
      </MenuItem>
      <MenuItem data-floating-image-rotate="right" @select="rotate(1)">
        {{ t("image.rotateRight") }}
      </MenuItem>
      <MenuItem data-floating-image-rotate="half" @select="rotate(2)">
        {{ t("image.rotateHalf") }}
      </MenuItem>
      <MenuItem data-floating-image-flip="vertical" @select="flip('vertical')">
        {{ t("image.flipVertical") }}
      </MenuItem>
      <MenuItem data-floating-image-flip="horizontal" @select="flip('horizontal')">
        {{ t("image.flipHorizontal") }}
      </MenuItem>
    </MenuSurface>
  </Teleport>
</template>

<style scoped lang="scss">
.sheet-floating-image-toolbar {
  position: fixed;
  z-index: 90;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 30px;
  padding: 2px;
  background: var(--idea-surface-panel);
  border: 1px solid var(--idea-border-subtle);
  border-radius: var(--idea-radius-default);
  box-shadow: var(--idea-shadow-menu);

  &__action {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 26px;
    padding: 0;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 2px;
    color: var(--idea-text-primary);
    cursor: pointer;

    &:not(:last-child)::after {
      position: absolute;
      top: 50%;
      right: -5px;
      width: 1px;
      height: 14px;
      background: var(--idea-border-strong);
      transform: translateY(-50%);
      pointer-events: none;
      content: "";
    }

    &:hover:not([aria-disabled="true"]) {
      background: var(--idea-surface-hover);
    }

    &[aria-disabled="true"] {
      color: var(--idea-text-secondary);
      cursor: default;
    }
  }

  &__rotate {
    gap: 1px;
  }

  &__rotate-menu {
    position: fixed;
    z-index: 91;
  }
}
</style>
