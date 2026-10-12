<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from "vue";
import {
  Palette,
  Square,
  Sparkles,
  Blend,
  RotateCcw,
  Pipette,
  Frame,
  SlidersHorizontal,
} from "lucide-vue-next";
import { InputNumber as TInputNumber } from "tdesign-vue-next/es/input-number";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { type FloatingImage, type ImageAppearance } from "@sheetcraft/core/workbook";
import { isPictureGroup } from "@sheetcraft/core";
import { isFramedPictureObject } from "@sheetcraft/core/picture-object";
import {
  isGroupedGroup,
  isGroupedPicture,
  type GroupedPicture,
} from "@sheetcraft/core/picture-group";
import { useAppI18n } from "../../../shared/i18n";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";
import RibbonButton from "../../../shared/ribbon/RibbonButton.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import GallerySection from "../../../shared/gallery/GallerySection.vue";
import ColorPalette from "../../../shared/color/ColorPalette.vue";
import { useMenu } from "../../../shared/menu/useMenu";
import {
  DEFAULT_WORKBOOK_THEME,
  resolveThemeColor,
  type ThemeColorReference,
} from "@sheetcraft/core/workbook-theme";
import { useWorkbookTheme } from "../../../shared/color/workbook-theme-context";
import { getPictureOwnDetailedStyle } from "../picture-detailed-style-edit";
import { pictureOutlineColorPatch, pictureOutlineWidthPatch } from "../picture-outline-edit";
import { picturePaintColorFromSelection } from "../picture-paint-edit";
import {
  requireStandalonePicture,
  UnsupportedPictureDocumentError,
} from "../picture-document-support";
const props = defineProps<{ image: FloatingImage | GroupedPicture; disabled: boolean }>();
function requireAppearanceSource(image: FloatingImage | GroupedPicture) {
  if (isGroupedPicture(image)) return image;
  if (isGroupedGroup(image))
    throw new UnsupportedPictureDocumentError("picture-container-consumer", [image.id]);
  return requireStandalonePicture(image);
}
// A container has no appearance source. Reject it before creating menu drafts.
requireAppearanceSource(props.image);
const sourceImage = computed(() => requireAppearanceSource(props.image));
const emit = defineEmits<{
  change: [patch: Partial<ImageAppearance> | undefined];
}>();
const { t } = useAppI18n();
type Mode =
  | "design"
  | "filters"
  | "color"
  | "effects"
  | "border"
  | "transparency"
  | "transparentColor";
const mode = ref<Mode>("color");
const designButton = ref<InstanceType<typeof RibbonMenuButton>>();
const filtersButton = ref<InstanceType<typeof RibbonMenuButton>>();
const colorButton = ref<InstanceType<typeof RibbonMenuButton>>();
const effectButton = ref<InstanceType<typeof RibbonMenuButton>>();
const borderButton = ref<InstanceType<typeof RibbonMenuButton>>();
const transparencyButton = ref<InstanceType<typeof RibbonMenuButton>>();
const transparentColorButton = ref<InstanceType<typeof RibbonMenuButton>>();
const triggerRef = computed(() => {
  switch (mode.value) {
    case "design":
      return designButton.value?.rootElement ?? null;
    case "filters":
      return filtersButton.value?.rootElement ?? null;
    case "color":
      return colorButton.value?.rootElement ?? null;
    case "effects":
      return effectButton.value?.rootElement ?? null;
    case "border":
      return borderButton.value?.rootElement ?? null;
    case "transparency":
      return transparencyButton.value?.rootElement ?? null;
    case "transparentColor":
      return transparentColorButton.value?.rootElement ?? null;
  }
});
const menuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const menuId = `picture-appearance-${useId()}`;
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef,
  menuSurfaceRef,
  disabled: computed(() => props.disabled),
});
const appearance = computed(() => sourceImage.value.transform?.appearance ?? {});
const workbookTheme = useWorkbookTheme();
const ownLine = computed(() => getPictureOwnDetailedStyle(appearance.value)?.line);
const outlineWidth = computed(() =>
  ownLine.value?.kind === "value" ? ownLine.value.value.widthPt / 0.75 : 0,
);
const outlineColor = computed(() => {
  const line = ownLine.value;
  if (line?.kind !== "value" || line.value.paint.kind !== "solid") return undefined;
  const color = line.value.paint.color;
  return color.kind === "rgb"
    ? color.rgb
    : color.kind === "theme"
      ? resolveThemeColor(workbookTheme?.value ?? DEFAULT_WORKBOOK_THEME, color.reference)
      : "#000000";
});
const isFramed = computed(() => {
  const image = sourceImage.value;
  return isGroupedPicture(image) || isFramedPictureObject(image);
});
const label = computed(() => t(`picture.${mode.value}`));
watch(
  [
    () => props.image.id,
    () =>
      isPictureGroup(props.image) || isGroupedGroup(props.image) ? undefined : props.image.assetId,
  ],
  () => dismiss("programmatic", false),
  { flush: "sync" },
);
async function toggle(next: Mode): Promise<void> {
  const image = requireAppearanceSource(props.image);
  if (props.disabled) return;
  const id = image.id;
  const assetId = image.assetId;
  if (mode.value !== next) {
    dismiss("programmatic", false);
    mode.value = next;
    await nextTick();
  }
  const current = requireAppearanceSource(props.image);
  if (props.disabled || current.id !== id || current.assetId !== assetId) return;
  toggleMenu();
}
function keydown(next: Mode, event: KeyboardEvent): void {
  requireAppearanceSource(props.image);
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  mode.value = next;
  onTriggerKeydown(event);
}
function change(patch: Partial<ImageAppearance>): boolean {
  requireAppearanceSource(props.image);
  if (props.disabled || (isFramed.value && patch.reflection === true)) return false;
  emit("change", patch);
  return true;
}
function number(key: "brightness" | "contrast" | "saturation" | "opacity", value: unknown): void {
  if (typeof value !== "number" || !Number.isFinite(value)) return;
  change({ [key]: key === "opacity" ? 1 - value / 100 : value / 100 });
}
function preset(patch: Partial<ImageAppearance>): void {
  if (change(patch)) dismiss("programmatic", true);
}
function borderWidth(value: unknown): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 20) return;
  change(pictureOutlineWidthPatch(appearance.value, value));
}
function outlineSelect(rgb: string | null, reference?: ThemeColorReference): void {
  change(
    pictureOutlineColorPatch(appearance.value, picturePaintColorFromSelection(rgb, reference)),
  );
}
function reset(): void {
  requireAppearanceSource(props.image);
  if (props.disabled) return;
  emit("change", undefined);
}
</script>
<template>
  <section
    v-if="!isPictureGroup(image) && !isGroupedGroup(image)"
    class="picture-appearance"
    role="group"
    :aria-label="t('picture.style')"
  >
    <RibbonMenuButton
      ref="colorButton"
      variant="tall"
      :label="t('picture.color')"
      :text="t('picture.color')"
      :disabled="disabled"
      :expanded="open && mode === 'color'"
      :menu-id="menuId"
      @activate="toggle('color')"
      @keydown="keydown('color', $event)"
      ><Palette
    /></RibbonMenuButton>
    <RibbonMenuButton
      ref="transparentColorButton"
      variant="tall"
      :label="t('picture.transparentColor')"
      :text="t('picture.transparentColor')"
      :disabled="disabled"
      :expanded="open && mode === 'transparentColor'"
      :menu-id="menuId"
      @activate="toggle('transparentColor')"
      @keydown="keydown('transparentColor', $event)"
      ><Pipette
    /></RibbonMenuButton>
    <RibbonMenuButton
      ref="effectButton"
      variant="tall"
      :label="t('picture.effects')"
      :text="t('picture.effects')"
      :disabled="disabled"
      :expanded="open && mode === 'effects'"
      :menu-id="menuId"
      @activate="toggle('effects')"
      @keydown="keydown('effects', $event)"
      ><Sparkles
    /></RibbonMenuButton>
    <RibbonMenuButton
      ref="borderButton"
      variant="tall"
      :label="t('picture.border')"
      :text="t('picture.border')"
      :disabled="disabled"
      :expanded="open && mode === 'border'"
      :menu-id="menuId"
      @activate="toggle('border')"
      @keydown="keydown('border', $event)"
      ><Square
    /></RibbonMenuButton>
    <div class="picture-appearance__stack">
      <RibbonMenuButton
        ref="transparencyButton"
        :label="t('picture.transparency')"
        :text="t('picture.transparency')"
        :disabled="disabled"
        :expanded="open && mode === 'transparency'"
        :menu-id="menuId"
        @activate="toggle('transparency')"
        @keydown="keydown('transparency', $event)"
        ><Blend
      /></RibbonMenuButton>
      <RibbonButton
        :label="t('picture.resetStyle')"
        :text="t('picture.resetStyle')"
        :disabled="disabled"
        @activate="reset"
        ><RotateCcw
      /></RibbonButton>
    </div>
    <RibbonMenuButton
      ref="designButton"
      variant="tall"
      :label="t('picture.design')"
      :text="t('picture.design')"
      :disabled="disabled"
      :expanded="open && mode === 'design'"
      :menu-id="menuId"
      @activate="toggle('design')"
      @keydown="keydown('design', $event)"
      ><Frame
    /></RibbonMenuButton>
    <RibbonMenuButton
      ref="filtersButton"
      variant="tall"
      :label="t('picture.filters')"
      :text="t('picture.filters')"
      :disabled="disabled"
      :expanded="open && mode === 'filters'"
      :menu-id="menuId"
      @activate="toggle('filters')"
      @keydown="keydown('filters', $event)"
      ><SlidersHorizontal
    /></RibbonMenuButton>
    <Teleport to="body">
      <MenuSurface
        v-if="open"
        :id="menuId"
        ref="menuSurfaceRef"
        :style="floatingStyles"
        class="picture-appearance__menu"
        :label="label"
      >
        <template #body>
          <template v-if="mode === 'color'">
            <GallerySection :title="t('picture.adjustments')">
              <div
                class="picture-appearance__field"
                role="group"
                :aria-label="t('picture.brightness')"
              >
                <span>{{ t("picture.brightness") }}</span
                ><TInputNumber
                  :model-value="(appearance.brightness ?? 1) * 100"
                  :min="0"
                  :max="200"
                  theme="column"
                  class="sheetcraft-input-number--persistent-controls"
                  size="small"
                  @change="number('brightness', $event)"
                />
              </div>
              <div
                class="picture-appearance__field"
                role="group"
                :aria-label="t('picture.contrast')"
              >
                <span>{{ t("picture.contrast") }}</span
                ><TInputNumber
                  :model-value="(appearance.contrast ?? 1) * 100"
                  :min="0"
                  :max="200"
                  theme="column"
                  class="sheetcraft-input-number--persistent-controls"
                  size="small"
                  @change="number('contrast', $event)"
                />
              </div>
              <div
                class="picture-appearance__field"
                role="group"
                :aria-label="t('picture.saturation')"
              >
                <span>{{ t("picture.saturation") }}</span
                ><TInputNumber
                  :model-value="(appearance.saturation ?? 1) * 100"
                  :min="0"
                  :max="200"
                  theme="column"
                  class="sheetcraft-input-number--persistent-controls"
                  size="small"
                  @change="number('saturation', $event)"
                />
              </div>
            </GallerySection>
          </template>
          <GallerySection v-else-if="mode === 'border'" :title="t('picture.border')">
            <ColorPalette :model-value="outlineColor" @select="outlineSelect" />
            <div
              class="picture-appearance__field"
              role="group"
              :aria-label="t('picture.borderWidth')"
            >
              <span>{{ t("picture.borderWidth") }}</span
              ><TInputNumber
                :model-value="outlineWidth"
                :min="0"
                :max="20"
                theme="column"
                class="sheetcraft-input-number--persistent-controls"
                size="small"
                @change="borderWidth"
              />
            </div>
          </GallerySection>
          <GallerySection
            v-else-if="mode === 'transparentColor'"
            :title="t('picture.transparentColor')"
          >
            <p class="picture-appearance__hint">{{ t("picture.transparentColorHint") }}</p>
            <ColorPalette
              :model-value="appearance.transparentColor ?? '#FFFFFF'"
              default-color="#FFFFFF"
              @select="change({ transparentColor: $event ?? '#FFFFFF' })"
            />
          </GallerySection>
          <GallerySection v-else-if="mode === 'transparency'" :title="t('picture.transparency')">
            <div
              class="picture-appearance__field"
              role="group"
              :aria-label="t('picture.transparency')"
            >
              <span>%</span
              ><TInputNumber
                :model-value="Math.round((1 - (appearance.opacity ?? 1)) * 100)"
                :min="0"
                :max="100"
                theme="column"
                class="sheetcraft-input-number--persistent-controls"
                size="small"
                @change="number('opacity', $event)"
              />
            </div>
          </GallerySection>
          <GallerySection v-else-if="mode === 'effects'" :title="t('picture.effects')">
            <TCheckbox
              :model-value="!!appearance.reflection"
              :disabled="isFramed || disabled"
              @update:model-value="change({ reflection: Boolean($event) })"
              >{{ t("picture.reflection") }}</TCheckbox
            >
          </GallerySection>
        </template>
        <template #footer>
          <template v-if="mode === 'design'">
            <MenuItem
              @select="
                preset({
                  border: { color: '#FFFFFF', width: 6 },
                  shadow: 'soft',
                  reflection: undefined,
                })
              "
              >{{ t("picture.designPlain") }}</MenuItem
            >
            <MenuItem
              @select="preset({ border: undefined, shadow: 'soft', reflection: undefined })"
              >{{ t("picture.designShadow") }}</MenuItem
            >
            <MenuItem
              :disabled="isFramed"
              @select="
                preset({
                  border: { color: '#D9E2F3', width: 2 },
                  shadow: undefined,
                  reflection: true,
                })
              "
              >{{ t("picture.designReflection") }}</MenuItem
            >
          </template>
          <template v-if="mode === 'filters'">
            <MenuItem
              @select="
                preset({
                  grayscale: undefined,
                  sepia: undefined,
                  saturation: undefined,
                  brightness: undefined,
                  contrast: undefined,
                })
              "
              >{{ t("picture.originalColor") }}</MenuItem
            >
            <MenuItem
              @select="
                preset({
                  grayscale: 1,
                  sepia: undefined,
                  saturation: 1,
                  brightness: 1,
                  contrast: 1.1,
                })
              "
              >{{ t("picture.grayscale") }}</MenuItem
            >
            <MenuItem
              @select="
                preset({
                  grayscale: undefined,
                  sepia: 0.4,
                  saturation: 1.15,
                  brightness: 1.05,
                  contrast: 1,
                })
              "
              >{{ t("picture.filterWarm") }}</MenuItem
            >
            <MenuItem
              @select="
                preset({
                  grayscale: 0.15,
                  sepia: undefined,
                  saturation: 0.75,
                  brightness: 1.1,
                  contrast: 0.9,
                })
              "
              >{{ t("picture.filterCool") }}</MenuItem
            >
            <MenuItem
              @select="
                preset({
                  grayscale: undefined,
                  sepia: undefined,
                  saturation: 1.5,
                  brightness: 1.05,
                  contrast: 1.2,
                })
              "
              >{{ t("picture.filterVivid") }}</MenuItem
            >
            <MenuItem
              @select="
                preset({
                  grayscale: 0.25,
                  sepia: 0.1,
                  saturation: 0.7,
                  brightness: 1.15,
                  contrast: 0.8,
                })
              "
              >{{ t("picture.filterFade") }}</MenuItem
            >
          </template>
          <template v-if="mode === 'color'">
            <MenuItem
              @select="
                preset({
                  grayscale: undefined,
                  sepia: undefined,
                  saturation: undefined,
                  brightness: undefined,
                  contrast: undefined,
                })
              "
              >{{ t("picture.originalColor") }}</MenuItem
            >
            <MenuItem @select="preset({ grayscale: 1, sepia: undefined })">{{
              t("picture.grayscale")
            }}</MenuItem>
            <MenuItem @select="preset({ sepia: 1, grayscale: undefined })">{{
              t("picture.sepia")
            }}</MenuItem>
            <MenuItem
              @select="preset({ saturation: 1.5, grayscale: undefined, sepia: undefined })"
              >{{ t("picture.vivid") }}</MenuItem
            >
          </template>
          <template v-else-if="mode === 'effects'">
            <MenuItem @select="preset({ shadow: 'soft' })">{{ t("picture.softShadow") }}</MenuItem>
            <MenuItem @select="preset({ shadow: 'hard' })">{{ t("picture.hardShadow") }}</MenuItem>
            <MenuItem @select="preset({ shadow: undefined, reflection: undefined })">{{
              t("picture.noEffects")
            }}</MenuItem>
          </template>
          <MenuItem v-else-if="mode === 'border'" @select="preset({ border: undefined })">{{
            t("picture.noBorder")
          }}</MenuItem>
          <MenuItem
            v-else-if="mode === 'transparentColor'"
            @select="preset({ transparentColor: undefined, transparentTolerance: undefined })"
            >{{ t("picture.clearTransparentColor") }}</MenuItem
          >
          <template v-else-if="mode === 'transparency'">
            <MenuItem @select="preset({ opacity: 1 })">0%</MenuItem>
            <MenuItem @select="preset({ opacity: 0.75 })">25%</MenuItem>
            <MenuItem @select="preset({ opacity: 0.5 })">50%</MenuItem>
            <MenuItem @select="preset({ opacity: 0.25 })">75%</MenuItem>
          </template>
        </template>
      </MenuSurface>
    </Teleport>
  </section>
</template>
<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;
.picture-appearance {
  @include ribbon.columns;
  &__stack {
    @include ribbon.stack;
  }
  &__menu {
    z-index: var(--sheetcraft-layer-menu);
    width: 260px;
  }
  &__field {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-block: 4px;
  }
  &__hint {
    margin: 0 0 8px;
    color: var(--sheetcraft-text-secondary);
  }
}
</style>
