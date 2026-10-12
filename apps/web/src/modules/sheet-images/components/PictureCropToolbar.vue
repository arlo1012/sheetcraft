<script setup lang="ts">
import type { PictureCropShape } from "@sheetcraft/core/shape-presets";
import PictureCropShapeMenu from "./PictureCropShapeMenu.vue";
import { computed, ref, useId } from "vue";
import { Check, ChevronDown, Crop, X, RotateCcw } from "lucide-vue-next";
import {
  useFloatingPanel,
  type FloatingReference,
} from "../../../shared/floating/useFloatingPanel";
import { useMenu } from "../../../shared/menu/useMenu";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import { useAppI18n } from "../../../shared/i18n";

const props = defineProps<{
  anchor: FloatingReference;
  ownerId: number;
  apply: () => boolean;
  cancel: () => void;
  setRatio: (ratio: number) => boolean;
  setShape: (shape: PictureCropShape | undefined) => boolean;
  resetShapeAndCrop: () => boolean;
  shape?: PictureCropShape;
}>();
const { t } = useAppI18n();
const toolbar = ref<HTMLElement | null>(null);
const ratioTrigger = ref<HTMLButtonElement | null>(null);
const ratioSurface = ref<InstanceType<typeof MenuSurface> | null>(null);
const ratioId = `picture-crop-ratio-${useId()}`;
const { floatingStyles: toolbarStyles } = useFloatingPanel(
  computed(() => props.anchor),
  toolbar,
  computed(() => true),
  { placement: "top-start", offset: 10 },
);
const {
  open,
  floatingStyles: menuStyles,
  dismiss,
  toggleMenu,
  onTriggerKeydown,
} = useMenu({
  triggerRef: ratioTrigger,
  menuSurfaceRef: ratioSurface,
});
// The numeric ratios are product choices; they are not a visual component registry.
const ratios = ["1:1", "3:2", "4:3", "5:3", "5:4", "16:9", "16:10", "2:3", "3:4", "3:5"] as const;
const actions = computed(() => {
  const id = props.ownerId,
    apply = props.apply,
    cancel = props.cancel,
    ratio = props.setRatio,
    shape = props.setShape,
    reset = props.resetShapeAndCrop;
  const current = () =>
    id === props.ownerId &&
    apply === props.apply &&
    cancel === props.cancel &&
    ratio === props.setRatio &&
    shape === props.setShape &&
    reset === props.resetShapeAndCrop;
  return {
    apply: () => {
      if (current()) apply();
    },
    cancel: () => {
      if (current()) cancel();
    },
    shape: (value: PictureCropShape | undefined) => current() && shape(value),
    reset: () => current() && reset(),
    ratio: (label: string) => {
      if (!current()) return;
      const [width, height] = label.split(":").map(Number);
      if (ratio(width! / height!)) dismiss("programmatic", true);
    },
  };
});
function onKeydown(event: KeyboardEvent): void {
  if (event.key !== "Escape" || event.isComposing) return;
  event.preventDefault();
  event.stopPropagation();
  actions.value.apply();
}
defineExpose({
  openRatios: () => {
    if (!open.value) toggleMenu();
  },
});
</script>
<template>
  <Teleport to="body">
    <div
      ref="toolbar"
      class="picture-crop-toolbar"
      :style="toolbarStyles"
      role="toolbar"
      :aria-label="t('image.crop')"
      :data-picture-crop-toolbar="ownerId"
      @keydown="onKeydown"
      @pointerdown.stop
      @click.stop
    >
      <button
        type="button"
        class="picture-crop-toolbar__button"
        :title="t('image.applyCrop')"
        @click="actions.apply"
        data-picture-crop-action="apply"
      >
        <Check :size="16" /><span>{{ t("image.applyCrop") }}</span>
      </button>
      <button
        ref="ratioTrigger"
        type="button"
        class="picture-crop-toolbar__button"
        :title="t('image.cropRatio')"
        aria-haspopup="menu"
        :aria-expanded="open"
        :aria-controls="open ? ratioId : undefined"
        @click="toggleMenu"
        @keydown="onTriggerKeydown"
        data-picture-crop-action="ratios"
      >
        <Crop :size="16" /><span>{{ t("image.cropRatio") }}</span
        ><ChevronDown :size="12" />
      </button>
      <PictureCropShapeMenu
        :owner-id="ownerId"
        :current="shape"
        :handler="actions.shape"
        :labels="{ trigger: t('image.cropShape'), applyRejected: t('picture.operationFailed') }"
      />
      <button
        type="button"
        class="picture-crop-toolbar__button"
        :title="t('image.resetShapeAndCrop')"
        @click="actions.reset"
        data-picture-crop-action="reset-shape"
      >
        <RotateCcw :size="16" /><span>{{ t("image.resetShapeAndCrop") }}</span>
      </button>
      <button
        type="button"
        class="picture-crop-toolbar__button"
        :title="t('image.cancelCrop')"
        @click="actions.cancel"
        data-picture-crop-action="cancel"
      >
        <X :size="16" /><span>{{ t("image.cancelCrop") }}</span>
      </button>
    </div>
    <MenuSurface
      v-if="open"
      :id="ratioId"
      ref="ratioSurface"
      class="picture-crop-toolbar__menu"
      :style="menuStyles"
      :label="t('image.cropRatio')"
      :data-picture-crop-toolbar="ownerId"
      @keydown="onKeydown"
    >
      <MenuItem @select="dismiss('programmatic', true)" data-picture-crop-ratio="free">{{
        t("image.cropFree")
      }}</MenuItem>
      <MenuItem
        v-for="ratio in ratios"
        :key="ratio"
        @select="actions.ratio(ratio)"
        :data-picture-crop-ratio="ratio"
        >{{ ratio }}</MenuItem
      >
    </MenuSurface>
  </Teleport>
</template>
<style scoped lang="scss">
@use "../../../shared/floating/floating-panel" as panel;
.picture-crop-toolbar {
  @include panel.toolbar-surface(var(--sheetcraft-layer-toolbar));
  position: fixed;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
  max-width: calc(100vw - 16px);
  flex-wrap: wrap;
  &__button {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-height: 30px;
    padding: 4px 7px;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: inherit;
    font: inherit;
    white-space: nowrap;
    cursor: pointer;
    &:hover {
      background: var(--sheetcraft-icon-button-hover-bg);
    }
    &:focus-visible {
      outline: 2px solid var(--sheetcraft-action-primary);
      outline-offset: 1px;
    }
  }
  &__menu {
    z-index: var(--sheetcraft-layer-menu);
    min-width: 116px;
  }
}
</style>
