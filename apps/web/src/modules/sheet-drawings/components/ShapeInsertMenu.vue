<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId, watch } from "vue";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import { Shapes } from "lucide-vue-next";
import { useAppI18n } from "../../../shared/i18n";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import { useMenu } from "../../../shared/menu/useMenu";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";
import ShapeGallery from "./ShapeGallery.vue";
import type { ShapeGalleryChoice, ShapeGalleryLocale } from "../shape-gallery";

const props = withDefaults(
  defineProps<{
    disabled?: boolean;
    ownerId?: string | number;
    handler: (choice: ShapeGalleryChoice, continuous: boolean) => boolean;
    locale?: ShapeGalleryLocale;
    editSessionId?: string;
  }>(),
  { disabled: false },
);
const { locale: appLocale } = useAppI18n();
const locale = computed<ShapeGalleryLocale>(
  () => props.locale ?? (appLocale.value === "zh-CN" ? "zh-CN" : "en-US"),
);
const menuLabels: Readonly<
  Record<
    ShapeGalleryLocale,
    Readonly<{ trigger: string; continuous: string; drawingHint: string; rejected: string }>
  >
> = {
  "en-US": {
    trigger: "Shapes",
    continuous: "Continuous drawing",
    drawingHint: "Choose a shape, then drag on the sheet. Press Esc to stop drawing.",
    rejected: "This shape could not be selected. Try again.",
  },
  "zh-CN": {
    trigger: "形状",
    continuous: "连续绘制",
    drawingHint: "选择形状后，在工作表中拖动绘制。按 Esc 退出绘制。",
    rejected: "暂时无法选择此形状，请重试。",
  },
};
const labels = computed(() => menuLabels[locale.value]);
const button = ref<InstanceType<typeof RibbonMenuButton> | null>(null);
const triggerRef = computed(() => button.value?.rootElement ?? null);
const surface = ref<InstanceType<typeof MenuSurface> | null>(null);
const gallery = ref<InstanceType<typeof ShapeGallery> | null>(null);
// The concrete gallery owns its responsive roving focus. Give useMenu the same
// first/last focus contract without changing its native choice controls.
const menuSurfaceRef = computed(() =>
  surface.value
    ? {
        rootElement: surface.value.rootElement,
        focusFirstItem: () => gallery.value?.focusSelected(),
        focusLastItem: () => {
          const choices = surface.value?.rootElement?.querySelectorAll<HTMLButtonElement>(
            "button[data-shape-choice]:not(:disabled)",
          );
          choices?.[choices.length - 1]?.focus();
        },
      }
    : null,
);
const menuId = `shape-insert-menu-${useId().replaceAll(":", "")}`;
const continuous = ref(false);
const rejected = ref(false);
let generation = 0;
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef,
  menuSurfaceRef,
  disabled: computed(() => props.disabled),
  onOpen() {
    generation++;
    continuous.value = false;
    rejected.value = false;
  },
  onDismiss() {
    generation++;
    rejected.value = false;
  },
});

/** A rendered gallery listener belongs to one menu opening and document owner. */
function selectionAction(): (choice: ShapeGalleryChoice) => void {
  const token = generation,
    ownerId = props.ownerId,
    handler = props.handler;
  const current = (): boolean =>
    open.value &&
    !props.disabled &&
    generation === token &&
    props.ownerId === ownerId &&
    props.handler === handler;
  return (choice) => {
    if (!current()) return;
    let accepted = false;
    try {
      accepted = handler(choice, continuous.value) === true;
    } catch {
      // A failed owner action leaves all gallery choices available for retry.
    }
    if (!current()) return;
    if (accepted) dismiss("programmatic", false);
    else rejected.value = true;
  };
}

watch(
  () => [props.ownerId, props.handler, props.editSessionId, props.disabled] as const,
  () => {
    generation++;
    dismiss("programmatic", false);
  },
  { flush: "sync" },
);
onBeforeUnmount(() => generation++);
</script>

<template>
  <span class="shape-insert-tool" :data-cell-edit-session="editSessionId">
    <RibbonMenuButton
      ref="button"
      variant="tall"
      :label="labels.trigger"
      :text="labels.trigger"
      :disabled="disabled"
      :expanded="open"
      :menu-id="menuId"
      data-insert-tool="shape"
      popup-role="menu"
      @activate="toggleMenu"
      @keydown="onTriggerKeydown"
      ><Shapes aria-hidden="true"
    /></RibbonMenuButton>
    <Teleport to="body">
      <MenuSurface
        v-if="open"
        :id="menuId"
        ref="surface"
        class="shape-insert-menu"
        :style="floatingStyles"
        :label="labels.trigger"
        :body-scrollable="false"
        :data-cell-edit-session="editSessionId"
        :data-shape-insert-owner="ownerId"
      >
        <template #body>
          <div class="shape-insert-menu__content">
            <ShapeGallery
              ref="gallery"
              :locale="locale"
              :disabled="disabled"
              :onChoose="selectionAction()"
            />
          </div>
        </template>
        <template #footer>
          <li class="shape-insert-menu__options" role="none">
            <Checkbox v-model="continuous" :disabled="disabled" data-shape-insert-continuous>{{
              labels.continuous
            }}</Checkbox>
            <p class="shape-insert-menu__hint">{{ labels.drawingHint }}</p>
            <p v-if="rejected" class="shape-insert-menu__hint" role="status" aria-live="polite">
              {{ labels.rejected }}
            </p>
          </li>
        </template>
      </MenuSurface>
    </Teleport>
  </span>
</template>

<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;

.shape-insert-tool {
  @include ribbon.tool;
}

.shape-insert-menu {
  width: 456px;
  max-width: calc(100vw - var(--sheetcraft-space-4) * 2);
  max-height: min(560px, calc(100dvh - var(--sheetcraft-space-4) * 2));
  z-index: var(--sheetcraft-layer-menu);

  &__content {
    display: grid;
    grid-template-rows: minmax(0, 1fr);
    min-width: 0;
    min-height: 0;
    padding: var(--sheetcraft-tool-panel-padding);
  }

  &__options {
    display: flex;
    flex-direction: column;
    gap: var(--sheetcraft-space-2);
    padding: var(--sheetcraft-space-2) var(--sheetcraft-tool-panel-padding);
  }

  &__hint {
    margin: 0;
    color: var(--sheetcraft-text-secondary);
    font-size: var(--sheetcraft-font-size-body-small);
    line-height: var(--sheetcraft-line-height-body-small);
  }
}
</style>
