<script setup lang="ts">
import type { PictureEffectEdit } from "../picture-effect-edit";
import { computed, nextTick, ref, useId, watch } from "vue";
import { Palette, Square, RotateCcw, Pipette, Frame, SlidersHorizontal } from "lucide-vue-next";
import NumericField from "../../../shared/numeric-field/NumericField.vue";
import type {
  NumericCandidate,
  NumericCommitResult,
  NumericFieldSpec,
} from "../../../shared/numeric-field/types";
import PictureEffectsMenu from "./PictureEffectsMenu.vue";
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
const props = defineProps<{
  image: FloatingImage | GroupedPicture;
  disabled: boolean;
  formatDisabled?: boolean;
  effectHandler?: (edit: PictureEffectEdit) => boolean;
  appearanceCommitHandler?: (patch: Partial<ImageAppearance>) => boolean;
  restoreEffectsFocusTarget?: () => HTMLElement | null;
}>();
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
  format: [target?: "effects"];
}>();
const { t } = useAppI18n();
const effectsMenu = ref<InstanceType<typeof PictureEffectsMenu>>();
defineExpose({
  getEffectsTrigger: (): HTMLElement | null =>
    props.disabled ? null : (effectsMenu.value?.getEffectsTrigger() ?? null),
});
type Mode =
  | "corrections"
  | "more"
  | "design"
  | "filters"
  | "color"
  | "border"
  | "transparency"
  | "transparentColor";
const mode = ref<Mode>("color");
const moreButton = ref<InstanceType<typeof RibbonMenuButton>>();
const correctionsButton = ref<InstanceType<typeof RibbonMenuButton>>();
const colorButton = ref<InstanceType<typeof RibbonMenuButton>>();
const borderButton = ref<InstanceType<typeof RibbonMenuButton>>();
const transparentColorButton = ref<InstanceType<typeof RibbonMenuButton>>();
const triggerRef = computed(() => {
  switch (mode.value) {
    case "more":
    case "design":
    case "filters":
    case "transparency":
      return moreButton.value?.rootElement ?? null;
    case "corrections":
      return correctionsButton.value?.rootElement ?? null;
    case "color":
      return colorButton.value?.rootElement ?? null;
    case "border":
      return borderButton.value?.rootElement ?? null;
    case "transparentColor":
      return transparentColorButton.value?.rootElement ?? null;
  }
});
const menuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const menuId = `picture-appearance-${useId()}`;
let menuGeneration = 0;
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef,
  menuSurfaceRef,
  disabled: computed(() => props.disabled),
  onOpen: () => menuGeneration++,
  onDismiss: () => menuGeneration++,
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
const label = computed(() =>
  t(
    `picture.${mode.value === "corrections" ? "adjustments" : mode.value === "more" ? "style" : mode.value}`,
  ),
);
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
type AppearanceNumber = "brightness" | "contrast" | "saturation" | "opacity" | "borderWidth";
function numberValue(key: AppearanceNumber): number {
  return key === "borderWidth" ? outlineWidth.value : (appearance.value[key] ?? 1);
}
const ratioSpec: NumericFieldSpec = {
  displayUnit: "%",
  toDisplay: (value) => value * 100,
  fromDisplay: (value) => value / 100,
  displayPrecision: 0,
  displayStep: 1,
  canonicalBounds: { min: 0, max: 2 },
};
const opacitySpec: NumericFieldSpec = {
  displayUnit: "%",
  toDisplay: (value) => (1 - value) * 100,
  fromDisplay: (value) => 1 - value / 100,
  displayPrecision: 0,
  displayStep: 1,
  canonicalBounds: { min: 0, max: 1 },
};
const borderSpec: NumericFieldSpec = {
  displayUnit: "px",
  displayPrecision: 2,
  displayStep: 1,
  canonicalBounds: { min: 0, max: 20 },
};
function numberSpec(key: AppearanceNumber): NumericFieldSpec {
  return key === "opacity" ? opacitySpec : key === "borderWidth" ? borderSpec : ratioSpec;
}
const numberCallbacks = computed(() => {
  void open.value;
  const source = sourceImage.value,
    generation = menuGeneration,
    handler = props.appearanceCommitHandler;
  function commit(key: AppearanceNumber, candidate: NumericCandidate): NumericCommitResult {
    requireAppearanceSource(props.image);
    if (
      candidate.kind !== "value" ||
      props.disabled ||
      !open.value ||
      !handler ||
      source !== sourceImage.value ||
      generation !== menuGeneration ||
      handler !== props.appearanceCommitHandler
    )
      return { accepted: false, error: t("picture.operationFailed") };
    const bounds = numberSpec(key).canonicalBounds;
    if (
      !Number.isFinite(candidate.value) ||
      (bounds?.min !== undefined && candidate.value < bounds.min) ||
      (bounds?.max !== undefined && candidate.value > bounds.max)
    )
      return { accepted: false, error: t("pictureFormat.outOfRange") };
    const patch =
      key === "borderWidth"
        ? pictureOutlineWidthPatch(appearance.value, candidate.value)
        : { [key]: candidate.value };
    return handler(patch) === true
      ? { accepted: true }
      : { accepted: false, error: t("picture.operationFailed") };
  }
  return {
    brightness: (value: NumericCandidate) => commit("brightness", value),
    contrast: (value: NumericCandidate) => commit("contrast", value),
    saturation: (value: NumericCandidate) => commit("saturation", value),
    opacity: (value: NumericCandidate) => commit("opacity", value),
    borderWidth: (value: NumericCandidate) => commit("borderWidth", value),
  };
});
function numberOwnerKey(key: AppearanceNumber): string {
  return `${sourceImage.value.id}:${sourceImage.value.assetId}:${menuGeneration}:${key}`;
}
function preset(patch: Partial<ImageAppearance>): void {
  if (change(patch)) dismiss("programmatic", true);
}
function outlineSelect(rgb: string | null, reference?: ThemeColorReference): void {
  change(
    pictureOutlineColorPatch(appearance.value, picturePaintColorFromSelection(rgb, reference)),
  );
}
const openFormat = computed(() => {
  void open.value;
  const image = sourceImage.value,
    generation = menuGeneration;
  return (): void => {
    requireAppearanceSource(props.image);
    if (props.disabled || !open.value || image !== props.image || generation !== menuGeneration)
      return;
    dismiss("programmatic", true);
    emit("format");
  };
});
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
    <div class="picture-appearance__stack">
      <RibbonMenuButton
        ref="transparentColorButton"
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
        ref="colorButton"
        :label="t('picture.color')"
        :text="t('picture.color')"
        :disabled="disabled"
        :expanded="open && mode === 'color'"
        :menu-id="menuId"
        @activate="toggle('color')"
        @keydown="keydown('color', $event)"
        ><Palette
      /></RibbonMenuButton>
    </div>
    <div class="picture-appearance__stack">
      <RibbonMenuButton
        ref="correctionsButton"
        :label="t('picture.adjustments')"
        :text="t('picture.adjustments')"
        :disabled="disabled"
        :expanded="open && mode === 'corrections'"
        :menu-id="menuId"
        @activate="toggle('corrections')"
        @keydown="keydown('corrections', $event)"
        ><SlidersHorizontal
      /></RibbonMenuButton>
      <RibbonMenuButton
        ref="moreButton"
        :label="t('picture.style')"
        :text="t('picture.style')"
        :disabled="disabled"
        :expanded="open && ['more', 'design', 'filters', 'transparency'].includes(mode)"
        :menu-id="menuId"
        @activate="toggle('more')"
        @keydown="keydown('more', $event)"
        ><Frame
      /></RibbonMenuButton>
    </div>
    <PictureEffectsMenu
      ref="effectsMenu"
      :restore-effects-focus-target="restoreEffectsFocusTarget"
      :source="sourceImage"
      :format-disabled="formatDisabled"
      :appearance="appearance"
      :disabled="disabled"
      :effect-handler="effectHandler"
      @format="emit('format', 'effects')"
    />
    <div class="picture-appearance__stack">
      <RibbonMenuButton
        ref="borderButton"
        :label="t('picture.border')"
        :text="t('picture.border')"
        :disabled="disabled"
        :expanded="open && mode === 'border'"
        :menu-id="menuId"
        @activate="toggle('border')"
        @keydown="keydown('border', $event)"
        ><Square
      /></RibbonMenuButton>
      <RibbonButton
        :label="t('picture.resetStyle')"
        :text="t('picture.resetStyle')"
        :disabled="disabled"
        @activate="reset"
        ><RotateCcw
      /></RibbonButton>
    </div>
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
          <p
            v-if="
              !appearanceCommitHandler && ['corrections', 'border', 'transparency'].includes(mode)
            "
            class="picture-appearance__hint"
            role="status"
          >
            {{ t("picture.numericViewerReadOnly") }}
          </p>
          <template v-if="mode === 'corrections'">
            <GallerySection :title="t('picture.adjustments')">
              <div
                class="picture-appearance__field"
                role="group"
                :aria-label="t('picture.brightness')"
              >
                <span>{{ t("picture.brightness") }}</span
                ><NumericField
                  :owner-key="numberOwnerKey('brightness')"
                  :value="{ kind: 'value', value: numberValue('brightness') }"
                  :spec="numberSpec('brightness')"
                  :label="t('picture.brightness')"
                  :disabled="disabled"
                  :read-only="!appearanceCommitHandler"
                  :hide-reason="!appearanceCommitHandler"
                  :reason="
                    !appearanceCommitHandler ? t('picture.numericViewerReadOnly') : undefined
                  "
                  :invalid-message="t('pictureFormat.outOfRange')"
                  :rejected-message="t('picture.operationFailed')"
                  :stale-message="t('pictureFormat.staleOwner')"
                  presentation="column"
                  :on-commit="numberCallbacks.brightness"
                />
              </div>
              <div
                class="picture-appearance__field"
                role="group"
                :aria-label="t('picture.contrast')"
              >
                <span>{{ t("picture.contrast") }}</span
                ><NumericField
                  :owner-key="numberOwnerKey('contrast')"
                  :value="{ kind: 'value', value: numberValue('contrast') }"
                  :spec="numberSpec('contrast')"
                  :label="t('picture.contrast')"
                  :disabled="disabled"
                  :read-only="!appearanceCommitHandler"
                  :hide-reason="!appearanceCommitHandler"
                  :reason="
                    !appearanceCommitHandler ? t('picture.numericViewerReadOnly') : undefined
                  "
                  :invalid-message="t('pictureFormat.outOfRange')"
                  :rejected-message="t('picture.operationFailed')"
                  :stale-message="t('pictureFormat.staleOwner')"
                  presentation="column"
                  :on-commit="numberCallbacks.contrast"
                />
              </div>
              <div
                class="picture-appearance__field"
                role="group"
                :aria-label="t('picture.saturation')"
              >
                <span>{{ t("picture.saturation") }}</span
                ><NumericField
                  :owner-key="numberOwnerKey('saturation')"
                  :value="{ kind: 'value', value: numberValue('saturation') }"
                  :spec="numberSpec('saturation')"
                  :label="t('picture.saturation')"
                  :disabled="disabled"
                  :read-only="!appearanceCommitHandler"
                  :hide-reason="!appearanceCommitHandler"
                  :reason="
                    !appearanceCommitHandler ? t('picture.numericViewerReadOnly') : undefined
                  "
                  :invalid-message="t('pictureFormat.outOfRange')"
                  :rejected-message="t('picture.operationFailed')"
                  :stale-message="t('pictureFormat.staleOwner')"
                  presentation="column"
                  :on-commit="numberCallbacks.saturation"
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
              ><NumericField
                :owner-key="numberOwnerKey('borderWidth')"
                :value="{ kind: 'value', value: numberValue('borderWidth') }"
                :spec="numberSpec('borderWidth')"
                :label="t('picture.borderWidth')"
                :disabled="disabled"
                :read-only="!appearanceCommitHandler"
                :hide-reason="!appearanceCommitHandler"
                :reason="!appearanceCommitHandler ? t('picture.numericViewerReadOnly') : undefined"
                :invalid-message="t('pictureFormat.outOfRange')"
                :rejected-message="t('picture.operationFailed')"
                :stale-message="t('pictureFormat.staleOwner')"
                presentation="column"
                :on-commit="numberCallbacks.borderWidth"
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
              ><NumericField
                :owner-key="numberOwnerKey('opacity')"
                :value="{ kind: 'value', value: numberValue('opacity') }"
                :spec="numberSpec('opacity')"
                :label="t('picture.transparency')"
                :disabled="disabled"
                :read-only="!appearanceCommitHandler"
                :hide-reason="!appearanceCommitHandler"
                :reason="!appearanceCommitHandler ? t('picture.numericViewerReadOnly') : undefined"
                :invalid-message="t('pictureFormat.outOfRange')"
                :rejected-message="t('picture.operationFailed')"
                :stale-message="t('pictureFormat.staleOwner')"
                presentation="column"
                :on-commit="numberCallbacks.opacity"
              />
            </div>
          </GallerySection>
        </template>
        <template #footer>
          <template v-if="mode === 'more'">
            <MenuItem @select="toggle('design')">{{ t("picture.design") }}</MenuItem>
            <MenuItem @select="toggle('filters')">{{ t("picture.filters") }}</MenuItem>
            <MenuItem @select="toggle('transparency')">{{ t("picture.transparency") }}</MenuItem>
          </template>
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
            <MenuItem v-if="isFramed" :disabled="disabled" @select="openFormat">
              {{ t("picture.reflection") }} · {{ t("pictureFormat.paneTitle") }}
            </MenuItem>
            <MenuItem
              v-else
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
