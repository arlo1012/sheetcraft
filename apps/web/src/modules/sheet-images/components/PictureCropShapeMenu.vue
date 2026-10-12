<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useAttrs, useId, watch } from "vue";
import { Shapes } from "lucide-vue-next";
import type { PictureCropShape } from "@sheetcraft/core/shape-presets";
import { useAppI18n } from "../../../shared/i18n";
import GallerySection from "../../../shared/gallery/GallerySection.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import { useMenu } from "../../../shared/menu/useMenu";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";
import {
  PICTURE_CROP_SHAPE_GALLERY,
  PICTURE_CROP_SHAPE_MENU_LABELS,
  pictureCropShapeChoiceValue,
  pictureCropShapePreview,
  type PictureCropShapeChoice,
  type PictureCropShapeLocale,
  type PictureCropShapeMenuLabels,
} from "../picture-crop-shape-catalog";

defineOptions({ inheritAttrs: false });
const props = withDefaults(
  defineProps<{
    current?: PictureCropShape;
    disabled?: boolean;
    handler: (shape: PictureCropShape | undefined) => boolean;
    ownerId?: string | number;
    locale?: PictureCropShapeLocale;
    variant?: "compact" | "tall";
    labels?: Partial<PictureCropShapeMenuLabels>;
  }>(),
  { disabled: false, variant: "compact" },
);
const attrs = useAttrs();
const { locale: appLocale } = useAppI18n();
const locale = computed<PictureCropShapeLocale>(
  () => props.locale ?? (appLocale.value === "zh-CN" ? "zh-CN" : "en-US"),
);
const labels = computed(() => ({
  ...PICTURE_CROP_SHAPE_MENU_LABELS[locale.value],
  ...props.labels,
}));
const selectedPreset = computed(() => props.current?.preset ?? "rect");
function toolbarOwner(): string | number | undefined {
  const value = props.ownerId ?? attrs["data-picture-crop-toolbar"];
  return typeof value === "string" || typeof value === "number" ? value : undefined;
}
const button = ref<InstanceType<typeof RibbonMenuButton>>();
const triggerRef = computed(() => button.value?.rootElement ?? null);
const menuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const menuId = `picture-crop-shape-${useId()}`;
const rejected = ref(false);
let generation = 0;
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef,
  menuSurfaceRef,
  disabled: computed(() => props.disabled),
  defaultFocus: "selected",
  onOpen() {
    generation++;
    rejected.value = false;
  },
  onDismiss() {
    generation++;
    rejected.value = false;
  },
});

/** Each rendered action belongs to one opening, owner and captured handler. */
function selectionAction(item: PictureCropShapeChoice): () => void {
  const token = generation,
    ownerId = props.ownerId,
    handler = props.handler;
  return () => {
    if (
      !open.value ||
      props.disabled ||
      generation !== token ||
      props.ownerId !== ownerId ||
      props.handler !== handler
    )
      return;
    let accepted = false;
    try {
      accepted = handler(pictureCropShapeChoiceValue(item.preset)) === true;
    } catch {
      // Keep the current mask and menu available when the owner cannot apply it.
    }
    if (accepted) dismiss("programmatic", true);
    else if (open.value && generation === token) rejected.value = true;
  };
}

watch(
  () => [props.ownerId, props.handler] as const,
  () => {
    generation++;
    dismiss("programmatic", false);
  },
  { flush: "sync" },
);
onBeforeUnmount(() => generation++);

function onGalleryKeydown(event: KeyboardEvent): void {
  if (
    event.defaultPrevented ||
    !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)
  )
    return;
  const container = event.currentTarget;
  const target = event.target;
  if (!(container instanceof HTMLElement) || !(target instanceof HTMLElement)) return;
  const active = target.closest<HTMLButtonElement>("button[role='menuitemradio']");
  const rows: HTMLButtonElement[][] = [];
  for (const grid of container.querySelectorAll<HTMLElement>(".picture-crop-shape__grid")) {
    const buttons = [...grid.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
    const first = buttons[0];
    if (!first) continue;
    // Read the actual wrap so keyboard movement follows responsive gallery rows.
    // Layout-less DOM tests use the desktop maximum of 17 columns.
    const nextRow = buttons.findIndex((item) => item.offsetTop !== first.offsetTop);
    const columns = nextRow > 0 ? nextRow : Math.min(17, buttons.length);
    for (let index = 0; index < buttons.length; index += columns)
      rows.push(buttons.slice(index, index + columns));
  }
  const buttons = rows.flat();
  const index = active ? buttons.indexOf(active) : -1;
  if (index < 0) return;
  let next: HTMLButtonElement | undefined;
  if (event.key === "Home") next = buttons[0];
  else if (event.key === "End") next = buttons.at(-1);
  else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    next =
      buttons[
        Math.max(0, Math.min(buttons.length - 1, index + (event.key === "ArrowLeft" ? -1 : 1)))
      ];
  } else {
    const rowIndex = rows.findIndex((row) => active && row.includes(active));
    const column = active ? rows[rowIndex]!.indexOf(active) : 0;
    const nextRow =
      rows[Math.max(0, Math.min(rows.length - 1, rowIndex + (event.key === "ArrowUp" ? -1 : 1)))];
    next = nextRow?.[Math.min(column, nextRow.length - 1)];
  }
  event.preventDefault();
  event.stopPropagation();
  next?.focus();
}
</script>

<template>
  <span v-bind="$attrs" class="picture-crop-shape" :data-picture-crop-toolbar="toolbarOwner()">
    <RibbonMenuButton
      ref="button"
      :variant="variant"
      :label="labels.trigger"
      :text="labels.trigger"
      :disabled="disabled"
      :expanded="open"
      :menu-id="menuId"
      @activate="toggleMenu"
      @keydown="onTriggerKeydown"
      ><Shapes
    /></RibbonMenuButton>
    <Teleport to="body">
      <MenuSurface
        v-if="open"
        :id="menuId"
        ref="menuSurfaceRef"
        class="picture-crop-shape__menu"
        :style="floatingStyles"
        :label="labels.trigger"
        :data-picture-crop-toolbar="toolbarOwner()"
      >
        <template #body>
          <div class="picture-crop-shape__gallery" @keydown="onGalleryKeydown">
            <GallerySection
              v-for="group in PICTURE_CROP_SHAPE_GALLERY"
              :key="group.id"
              :title="group.label[locale]"
            >
              <div
                class="picture-crop-shape__grid"
                role="group"
                :aria-label="group.label[locale]"
                :data-picture-crop-category="group.id"
              >
                <button
                  v-for="item in group.items"
                  :key="item.preset"
                  class="picture-crop-shape__choice"
                  type="button"
                  role="menuitemradio"
                  tabindex="-1"
                  :disabled="disabled"
                  :aria-disabled="disabled"
                  :aria-label="item.label[locale]"
                  :title="item.label[locale]"
                  :aria-checked="item.preset === selectedPreset"
                  :data-picture-crop-shape="item.preset"
                  :onClick="selectionAction(item)"
                >
                  <svg
                    :viewBox="pictureCropShapePreview(item.preset).viewBox"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path
                      v-for="(path, index) in pictureCropShapePreview(item.preset).paths"
                      :key="index"
                      :d="path.d"
                      :fill="path.filled ? 'var(--sheetcraft-action-primary-subtle)' : 'none'"
                      :stroke="path.stroke ? 'var(--sheetcraft-action-primary)' : 'none'"
                      stroke-width="1"
                      stroke-linejoin="round"
                      vector-effect="non-scaling-stroke"
                    />
                  </svg>
                </button>
              </div>
            </GallerySection>
          </div>
        </template>
        <template v-if="rejected" #footer>
          <li class="picture-crop-shape__error" role="none">
            <span role="alert">{{ labels.applyRejected }}</span>
          </li>
        </template>
      </MenuSurface>
    </Teleport>
  </span>
</template>

<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;
@use "../../../shared/gallery/gallery-choice" as gallery;

.picture-crop-shape {
  @include ribbon.tool;

  &__menu {
    width: 524px;
    max-height: min(540px, 70vh);
    z-index: var(--sheetcraft-layer-menu);
  }

  &__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(28px, 1fr));
    gap: var(--sheetcraft-space-1);
  }

  &__choice {
    @include gallery.choice;

    display: grid;
    place-items: center;
    min-width: 0;
    height: 28px;

    svg {
      display: block;
      width: 22px;
      height: 22px;
    }
  }

  &__error {
    padding: var(--sheetcraft-space-3) var(--sheetcraft-tool-panel-padding);
    color: var(--sheetcraft-text-secondary);
    font-size: var(--sheetcraft-font-size-body-small);
    line-height: var(--sheetcraft-line-height-body-small);
  }
}
</style>
