<script setup lang="ts">
import { computed, ref, useId, watch } from "vue";
import {
  PanelsTopLeft,
  SquareCheck,
  CircleDot,
  List,
  ListFilter,
  ChevronsUpDown,
  SlidersHorizontal,
  RectangleHorizontal,
  Type,
  SquareDashed,
} from "lucide-vue-next";
import type { FormControlType } from "@sheetcraft/core/form-controls";
import { useAppI18n } from "../../../shared/i18n";
import GallerySection from "../../../shared/gallery/GallerySection.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import { useMenu } from "../../../shared/menu/useMenu";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";

const props = defineProps<{
  disabled: boolean;
  ownerId?: string | number;
  compact?: boolean;
  fullWidth?: boolean;
}>();
const emit = defineEmits<{ insert: [type: FormControlType] }>();
const { t } = useAppI18n();
const button = ref<InstanceType<typeof RibbonMenuButton>>();
const surface = ref<InstanceType<typeof MenuSurface>>();
const menuId = `form-control-insert-${useId().replaceAll(":", "")}`;
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef: computed(() => button.value?.rootElement ?? null),
  menuSurfaceRef: computed(() => surface.value ?? null),
  disabled: computed(() => props.disabled),
});

const groups = [
  {
    id: "selection",
    titleKey: "control.groupSelection",
    items: [
      { type: "checkbox", labelKey: "control.checkbox", icon: SquareCheck },
      { type: "radio", labelKey: "control.radio", icon: CircleDot },
      { type: "combo", labelKey: "control.combo", icon: ListFilter },
      { type: "list", labelKey: "control.list", icon: List },
    ],
  },
  {
    id: "value",
    titleKey: "control.groupValue",
    items: [
      { type: "spinner", labelKey: "control.spinner", icon: ChevronsUpDown },
      { type: "scrollbar", labelKey: "control.scrollbar", icon: SlidersHorizontal },
    ],
  },
  {
    id: "layout",
    titleKey: "control.groupLayout",
    items: [
      { type: "button", labelKey: "control.button", icon: RectangleHorizontal },
      { type: "label", labelKey: "control.label", icon: Type },
      { type: "group", labelKey: "control.group", icon: SquareDashed },
    ],
  },
] as const;

function insert(type: FormControlType): void {
  if (props.disabled) return;
  dismiss("programmatic", false);
  emit("insert", type);
}
watch(
  () => props.ownerId,
  () => dismiss("programmatic", false),
);
</script>

<template>
  <span class="form-control-insert" :class="{ 'is-full-width': fullWidth }">
    <RibbonMenuButton
      ref="button"
      :variant="compact ? 'compact' : 'tall'"
      :full-width="fullWidth"
      :label="t('control.title')"
      :text="t('control.title')"
      :disabled="disabled"
      :expanded="open"
      :menu-id="menuId"
      data-insert-tool="control"
      @activate="toggleMenu"
      @keydown="onTriggerKeydown"
      ><PanelsTopLeft
    /></RibbonMenuButton>
    <Teleport to="body">
      <MenuSurface
        v-if="open"
        :id="menuId"
        ref="surface"
        :label="t('control.title')"
        :style="floatingStyles"
        class="form-control-insert__menu"
      >
        <template #body>
          <GallerySection v-for="group in groups" :key="group.id" :title="t(group.titleKey)">
            <div class="form-control-insert__grid" :data-form-control-group="group.id">
              <button
                v-for="item in group.items"
                :key="item.type"
                type="button"
                role="menuitem"
                tabindex="-1"
                class="form-control-insert__choice"
                :data-form-control-type="item.type"
                @click="insert(item.type)"
              >
                <component
                  :is="item.icon"
                  class="form-control-insert__icon"
                  :size="15"
                  aria-hidden="true"
                />
                <span class="form-control-insert__label">{{ t(item.labelKey) }}</span>
              </button>
            </div>
          </GallerySection>
        </template>
      </MenuSurface>
    </Teleport>
  </span>
</template>

<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;
@use "../../../shared/gallery/gallery-choice" as gallery;

.form-control-insert {
  @include ribbon.tool;

  &.is-full-width {
    display: flex;
    width: 100%;
  }

  &__menu {
    width: 268px;
    max-width: calc(100vw - var(--sheetcraft-space-4) * 2);
    z-index: var(--sheetcraft-layer-menu);
  }

  &__grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--sheetcraft-space-1);
  }

  &__choice {
    @include gallery.choice(6px);

    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: var(--sheetcraft-space-2);
    min-height: 30px;
    padding: 0 var(--sheetcraft-space-2);
    text-align: left;
  }

  &__icon {
    flex: none;
    color: var(--sheetcraft-text-secondary);
  }

  &__label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--sheetcraft-font-size-body-small);
    line-height: var(--sheetcraft-line-height-body-small);
  }
}
</style>
