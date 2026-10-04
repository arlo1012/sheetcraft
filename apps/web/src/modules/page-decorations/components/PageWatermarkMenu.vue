<script setup lang="ts">
import { computed, nextTick, ref, useId } from "vue";
import { Droplets, Ellipsis, Plus } from "lucide-vue-next";
import {
  DEFAULT_SHEET_WATERMARK,
  type SheetWatermark,
  type WatermarkPreset,
} from "@idea10/core/page-decoration";
import { useAppI18n } from "../../../shared/i18n";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSeparator from "../../../shared/menu/MenuSeparator.vue";
import GallerySection from "../../../shared/gallery/GallerySection.vue";
import { useFloatingPanel } from "../../../shared/floating/useFloatingPanel";
import { useMenu } from "../../../shared/menu/useMenu";

const props = withDefaults(
  defineProps<{
    disabled: boolean;
    watermark?: SheetWatermark;
    presets?: readonly WatermarkPreset[];
    imageAssetUrls?: ReadonlyMap<string, string>;
  }>(),
  { presets: () => [], imageAssetUrls: undefined },
);
const emit = defineEmits<{
  apply: [watermark: SheetWatermark];
  custom: [];
  editDocument: [];
  remove: [];
  applyPreset: [preset: WatermarkPreset, scope: "sheet" | "workbook"];
  editPreset: [preset: WatermarkPreset];
  deletePreset: [preset: WatermarkPreset];
}>();
const { t } = useAppI18n();
const trigger = ref<InstanceType<typeof RibbonMenuButton> | null>(null);
const surface = ref<InstanceType<typeof MenuSurface> | null>(null);
const submenuSurface = ref<InstanceType<typeof MenuSurface> | null>(null);
const activePreset = ref<WatermarkPreset>();
const actionTriggers = new Map<string, HTMLButtonElement>();
const menuId = `page-watermark-${useId()}`;
const submenuId = `page-watermark-actions-${useId()}`;
const submenuRef = computed(() => submenuSurface.value?.rootElement ?? null);
const submenuAnchor = computed<HTMLElement | null>(() =>
  activePreset.value ? (actionTriggers.get(activePreset.value.id) ?? null) : null,
);
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef: computed(() => trigger.value?.rootElement ?? null),
  menuSurfaceRef: surface,
  disabled: computed(() => props.disabled),
  additionalInside: () => [submenuRef.value],
  defaultFocus: "menu",
  pointerFocus: "menu",
  onDismiss: () => {
    activePreset.value = undefined;
  },
});
const { floatingStyles: submenuStyles } = useFloatingPanel(
  submenuAnchor,
  submenuRef,
  computed(() => activePreset.value !== undefined),
  { placement: "right-start", offset: 4 },
);

const builtinWatermarks = computed(() => [
  { id: "confidential", text: t("pageDecoration.confidential") },
  { id: "top-secret", text: t("pageDecoration.topSecret") },
  { id: "no-copy", text: t("pageDecoration.noCopy") },
  { id: "internal-use", text: t("pageDecoration.internalUse") },
]);

function apply(text: string): void {
  dismiss("programmatic", true);
  emit("apply", { ...DEFAULT_SHEET_WATERMARK, text });
}
function custom(): void {
  dismiss("programmatic", false);
  emit("custom");
}
function editDocument(): void {
  dismiss("programmatic", false);
  emit("editDocument");
}
function remove(): void {
  dismiss("programmatic", true);
  emit("remove");
}
function imageUrl(watermark: SheetWatermark): string | undefined {
  const assetId = watermark.image?.assetId;
  return assetId ? props.imageAssetUrls?.get(assetId) : undefined;
}
function previewText(watermark: SheetWatermark): string {
  return watermark.text || t("pageDecoration.imageWatermark");
}
function actionTriggerRef(id: string) {
  return (element: unknown): void => {
    if (element instanceof HTMLButtonElement) actionTriggers.set(id, element);
    else actionTriggers.delete(id);
  };
}
function openPresetActions(preset: WatermarkPreset, focus = false): void {
  if (props.disabled) return;
  activePreset.value = preset;
  if (focus) void nextTick(() => submenuSurface.value?.focusFirstItem());
}
function togglePresetActions(preset: WatermarkPreset): void {
  if (activePreset.value?.id === preset.id) {
    activePreset.value = undefined;
    return;
  }
  openPresetActions(preset);
}
function openPresetActionsFromKeyboard(event: KeyboardEvent, preset: WatermarkPreset): void {
  if (event.key !== "ContextMenu" && !(event.key === "F10" && event.shiftKey)) return;
  event.preventDefault();
  openPresetActions(preset, true);
}
function applyPreset(preset: WatermarkPreset, scope: "sheet" | "workbook"): void {
  if (props.disabled) return;
  activePreset.value = undefined;
  dismiss("programmatic", true);
  emit("applyPreset", preset, scope);
}
function editPreset(preset: WatermarkPreset): void {
  if (props.disabled) return;
  activePreset.value = undefined;
  dismiss("programmatic", true);
  emit("editPreset", preset);
}
function deletePreset(preset: WatermarkPreset): void {
  if (props.disabled) return;
  activePreset.value = undefined;
  emit("deletePreset", preset);
}
</script>

<template>
  <span class="page-watermark-menu">
    <RibbonMenuButton
      ref="trigger"
      variant="tall"
      :label="t('pageDecoration.watermark')"
      :text="t('pageDecoration.watermark')"
      :disabled="disabled"
      :expanded="open"
      :menu-id="menuId"
      data-page-tool="watermark"
      @activate="toggleMenu"
      @keydown="onTriggerKeydown"
      ><Droplets
    /></RibbonMenuButton>
    <Teleport to="body">
      <MenuSurface
        v-if="open"
        :id="menuId"
        ref="surface"
        :style="floatingStyles"
        :label="t('pageDecoration.watermark')"
        class="page-watermark-menu__surface"
      >
        <li class="page-watermark-menu__gallery" role="none">
          <GallerySection :title="t('pageDecoration.customWatermarks')">
            <div
              class="page-watermark-menu__grid"
              role="group"
              :aria-label="t('pageDecoration.customWatermarks')"
            >
              <div
                v-for="preset in presets"
                :key="preset.id"
                class="page-watermark-menu__card-wrap"
              >
                <button
                  type="button"
                  class="page-watermark-menu__card"
                  :disabled="disabled"
                  :data-watermark-preset-id="preset.id"
                  :title="preset.name"
                  :aria-label="preset.name"
                  @click="applyPreset(preset, 'sheet')"
                  @contextmenu.prevent="openPresetActions(preset)"
                  @keydown="openPresetActionsFromKeyboard($event, preset)"
                >
                  <img
                    v-if="imageUrl(preset.watermark)"
                    :src="imageUrl(preset.watermark)"
                    class="page-watermark-menu__image-preview"
                    :class="{
                      'page-watermark-menu__image-preview--washout':
                        preset.watermark.image?.washout,
                    }"
                    :style="{
                      transform: `rotate(${preset.watermark.image?.angle ?? 0}deg)`,
                    }"
                    alt=""
                  />
                  <span
                    v-if="preset.watermark.text || !imageUrl(preset.watermark)"
                    class="page-watermark-menu__text-preview"
                    :style="{
                      color: preset.watermark.color,
                      fontFamily: preset.watermark.fontFamily,
                      fontSize: `${Math.min(22, Math.max(12, preset.watermark.fontSize * 0.55))}px`,
                      opacity: preset.watermark.opacity,
                      transform: `rotate(${preset.watermark.angle}deg)`,
                    }"
                    >{{ previewText(preset.watermark) }}</span
                  >
                </button>
                <button
                  :ref="actionTriggerRef(preset.id)"
                  type="button"
                  class="page-watermark-menu__more"
                  :data-watermark-preset-actions="preset.id"
                  :aria-label="t('pageDecoration.presetActions', { name: preset.name })"
                  :aria-controls="activePreset?.id === preset.id ? submenuId : undefined"
                  :aria-expanded="activePreset?.id === preset.id"
                  @click.stop="togglePresetActions(preset)"
                >
                  <Ellipsis aria-hidden="true" />
                </button>
              </div>
              <button
                type="button"
                class="page-watermark-menu__card page-watermark-menu__add"
                :disabled="disabled"
                :aria-label="t('pageDecoration.addWatermark')"
                @click="custom"
              >
                <Plus aria-hidden="true" /><span>{{ t("pageDecoration.clickToAdd") }}</span>
              </button>
            </div>
          </GallerySection>
          <GallerySection :title="t('pageDecoration.presetWatermarks')">
            <div
              class="page-watermark-menu__grid"
              role="group"
              :aria-label="t('pageDecoration.presetWatermarks')"
            >
              <button
                v-for="preset in builtinWatermarks"
                :key="preset.id"
                type="button"
                class="page-watermark-menu__card"
                :disabled="disabled"
                :aria-label="preset.text"
                @click="apply(preset.text)"
              >
                <span
                  class="page-watermark-menu__text-preview"
                  :style="{ transform: 'rotate(-45deg)' }"
                  >{{ preset.text }}</span
                >
              </button>
            </div>
          </GallerySection>
        </li>
        <MenuSeparator />
        <MenuItem :disabled="!watermark" @select="editDocument">{{
          t("pageDecoration.editDocumentWatermark")
        }}</MenuItem>
        <MenuItem :disabled="!watermark" @select="remove">{{
          t("pageDecoration.removeDocumentWatermark")
        }}</MenuItem>
      </MenuSurface>
    </Teleport>
    <Teleport to="body">
      <MenuSurface
        v-if="activePreset"
        :id="submenuId"
        ref="submenuSurface"
        class="page-watermark-menu__preset-actions"
        :style="submenuStyles"
        :label="activePreset.name"
      >
        <MenuItem @select="applyPreset(activePreset, 'workbook')">
          {{ t("pageDecoration.applyToWorkbook") }}
        </MenuItem>
        <MenuItem @select="applyPreset(activePreset, 'sheet')">
          {{ t("pageDecoration.applyToCurrentSheet") }}
        </MenuItem>
        <MenuSeparator />
        <MenuItem @select="editPreset(activePreset)">
          {{ t("pageDecoration.editWatermark") }}
        </MenuItem>
        <MenuItem danger data-watermark-preset-action="delete" @select="deletePreset(activePreset)">
          {{ t("pageDecoration.deleteWatermark") }}
        </MenuItem>
      </MenuSurface>
    </Teleport>
  </span>
</template>

<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;

.page-watermark-menu {
  @include ribbon.tool;

  &__surface {
    position: fixed;
    z-index: 80;
    width: 410px;
    max-width: calc(100vw - 16px);
    padding: 0 0 var(--idea-menu-padding);
  }

  &__gallery {
    list-style: none;
  }

  &__grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--idea-space-3);
  }

  &__card-wrap {
    position: relative;
    min-width: 0;
  }

  &__card {
    display: grid;
    width: 100%;
    aspect-ratio: 0.82;
    place-items: center;
    padding: var(--idea-space-2);
    overflow: hidden;
    color: #b7b7b7;
    background: var(--idea-surface-panel);
    border: 1px solid var(--idea-border-subtle);
    border-radius: var(--idea-radius-small);
    cursor: pointer;

    &:hover:not(:disabled),
    &:focus-visible:not(:disabled) {
      border-color: var(--idea-action-primary);
      outline: none;
      box-shadow: 0 0 0 1px var(--idea-action-primary);
    }

    &:disabled {
      cursor: default;
      opacity: 0.5;
    }
  }

  &__text-preview {
    display: block;
    max-width: 132%;
    color: #c8c8c8;
    font-size: 16px;
    line-height: 1.1;
    font-weight: 500;
    white-space: nowrap;
    pointer-events: none;
  }

  &__image-preview {
    grid-area: 1 / 1;
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    pointer-events: none;

    &--washout {
      opacity: 0.45;
      filter: grayscale(1);
    }
  }

  &__card > &__text-preview {
    grid-area: 1 / 1;
  }

  &__add {
    gap: var(--idea-space-1);
    color: var(--idea-action-primary);
    font-size: var(--idea-font-size-body-small);

    :deep(svg) {
      width: 22px;
      height: 22px;
      color: var(--idea-text-secondary);
    }
  }

  &__more {
    position: absolute;
    top: 3px;
    right: 3px;
    display: grid;
    width: 20px;
    height: 20px;
    padding: 0;
    place-items: center;
    color: var(--idea-text-secondary);
    background: var(--idea-surface-panel);
    border: 0;
    border-radius: var(--idea-radius-small);
    cursor: pointer;

    &:hover,
    &:focus-visible {
      background: var(--idea-surface-hover);
      outline: none;
    }
    :deep(svg) {
      width: 16px;
      height: 16px;
    }
  }

  &__preset-actions {
    z-index: 100;
  }
}
</style>
