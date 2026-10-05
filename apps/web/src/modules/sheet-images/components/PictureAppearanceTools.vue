<script setup lang="ts">
import { computed, nextTick, ref, useId } from "vue";
import { Palette, Square, Sun, Blend, RotateCcw, Pipette } from "lucide-vue-next";
import { InputNumber as TInputNumber } from "tdesign-vue-next/es/input-number";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import {
  normalizeImageTransform,
  type FloatingImage,
  type ImageAppearance,
} from "@idea10/core/workbook";
import { useAppI18n } from "../../../shared/i18n";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";
import RibbonButton from "../../../shared/ribbon/RibbonButton.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import GallerySection from "../../../shared/gallery/GallerySection.vue";
import ColorPalette from "../../../shared/color/ColorPalette.vue";
import { useMenu } from "../../../shared/menu/useMenu";
const props = defineProps<{ image: FloatingImage; disabled: boolean }>();
const emit = defineEmits<{ update: [image: FloatingImage] }>();
const { t } = useAppI18n();
type Mode = "color" | "effects" | "border" | "transparency" | "transparentColor";
const mode = ref<Mode>("color");
const colorButton = ref<InstanceType<typeof RibbonMenuButton>>();
const effectButton = ref<InstanceType<typeof RibbonMenuButton>>();
const borderButton = ref<InstanceType<typeof RibbonMenuButton>>();
const transparencyButton = ref<InstanceType<typeof RibbonMenuButton>>();
const transparentColorButton = ref<InstanceType<typeof RibbonMenuButton>>();
const triggerRef = computed(() => {
  switch (mode.value) {
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
const appearance = computed(() => props.image.transform?.appearance ?? {});
const label = computed(() => t(`picture.${mode.value}`));
async function toggle(next: Mode): Promise<void> {
  if (props.disabled) return;
  if (mode.value !== next) {
    dismiss("programmatic", false);
    mode.value = next;
    await nextTick();
  }
  toggleMenu();
}
function keydown(next: Mode, event: KeyboardEvent): void {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  mode.value = next;
  onTriggerKeydown(event);
}
function change(patch: Partial<ImageAppearance>): void {
  if (props.disabled) return;
  const transform = normalizeImageTransform({
    ...props.image.transform,
    appearance: { ...appearance.value, ...patch },
  });
  emit("update", { ...props.image, transform });
}
function number(key: "brightness" | "contrast" | "saturation" | "opacity", value: unknown): void {
  if (typeof value !== "number" || !Number.isFinite(value)) return;
  change({ [key]: key === "opacity" ? 1 - value / 100 : value / 100 });
}
function preset(patch: Partial<ImageAppearance>): void {
  change(patch);
  dismiss("programmatic", true);
}
function reset(): void {
  if (props.disabled) return;
  emit("update", {
    ...props.image,
    transform: normalizeImageTransform({ ...props.image.transform, appearance: undefined }),
  });
}
</script>
<template>
  <section class="picture-appearance" role="group" :aria-label="t('picture.style')">
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
      ><Sun
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
        :disabled="disabled || !image.transform?.appearance"
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
                  class="idea-input-number--persistent-controls"
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
                  class="idea-input-number--persistent-controls"
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
                  class="idea-input-number--persistent-controls"
                  size="small"
                  @change="number('saturation', $event)"
                />
              </div>
            </GallerySection>
          </template>
          <GallerySection v-else-if="mode === 'border'" :title="t('picture.border')">
            <ColorPalette
              :model-value="appearance.border?.color ?? '#000000'"
              @select="
                change({
                  border: { color: $event ?? '#000000', width: appearance.border?.width ?? 1 },
                })
              "
            />
            <div
              class="picture-appearance__field"
              role="group"
              :aria-label="t('picture.borderWidth')"
            >
              <span>{{ t("picture.borderWidth") }}</span
              ><TInputNumber
                :model-value="appearance.border?.width ?? 0"
                :min="0"
                :max="20"
                theme="column"
                class="idea-input-number--persistent-controls"
                size="small"
                @change="
                  typeof $event === 'number' &&
                  change({
                    border: { color: appearance.border?.color ?? '#000000', width: $event },
                  })
                "
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
                class="idea-input-number--persistent-controls"
                size="small"
                @change="number('opacity', $event)"
              />
            </div>
          </GallerySection>
          <GallerySection v-else :title="t('picture.effects')">
            <TCheckbox
              :model-value="!!appearance.reflection"
              @update:model-value="change({ reflection: Boolean($event) })"
              >{{ t("picture.reflection") }}</TCheckbox
            >
          </GallerySection>
        </template>
        <template #items>
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
    z-index: var(--idea-layer-menu);
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
    color: var(--idea-text-secondary);
  }
}
</style>
