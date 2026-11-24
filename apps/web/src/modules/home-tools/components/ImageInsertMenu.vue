<script setup lang="ts">
import { Image as ImageIcon, LayoutGrid } from "lucide-vue-next";
import { computed, ref, useId } from "vue";
import { useAppI18n } from "../../../shared/i18n";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSeparator from "../../../shared/menu/MenuSeparator.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";
import { useMenu } from "../../../shared/menu/useMenu";

defineOptions({ inheritAttrs: false });

const props = withDefaults(defineProps<{ disabled: boolean; compact?: boolean; text?: string }>(), {
  compact: false,
});
const emit = defineEmits<{ insertImage: [mode: "cell" | "floating"] }>();
const { t } = useAppI18n();
const previewMode = ref<"cell" | "floating">("cell");
const triggerComponentRef = ref<InstanceType<typeof RibbonMenuButton> | null>(null);
const triggerRef = computed(() => triggerComponentRef.value?.rootElement ?? null);
const menuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const menuId = `image-insert-menu-${useId().replaceAll(":", "")}`;
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef,
  menuSurfaceRef,
  disabled: computed(() => props.disabled),
});

function insertImage(mode: "cell" | "floating"): void {
  if (props.disabled) return;
  previewMode.value = mode;
  dismiss("programmatic", false);
  emit("insertImage", mode);
}
</script>

<template>
  <span v-bind="$attrs" class="ribbon-menu-tool">
    <RibbonMenuButton
      ref="triggerComponentRef"
      :label="t('image.insertMenu')"
      :text="text ?? t('ribbon.image')"
      :disabled="disabled"
      :variant="compact ? 'compact' : 'tall'"
      data-ribbon-action="image"
      :data-ribbon-layout="compact ? 'compact' : 'tall'"
      :data-ribbon-span="compact ? '1' : '2'"
      popup-role="menu"
      :expanded="open"
      :menu-id="menuId"
      @activate="toggleMenu"
      @keydown="onTriggerKeydown"
    >
      <ImageIcon aria-hidden="true" />
    </RibbonMenuButton>

    <Teleport to="body">
      <MenuSurface
        v-if="open"
        :id="menuId"
        ref="menuSurfaceRef"
        class="image-insert-menu"
        :style="floatingStyles"
        :label="t('image.insertMenu')"
      >
        <template #items>
          <MenuItem
            data-image-insert-mode="cell"
            @pointerenter="previewMode = 'cell'"
            @focus="previewMode = 'cell'"
            @select="insertImage('cell')"
          >
            <template #icon><LayoutGrid /></template>{{ t("image.insertInCell") }}
          </MenuItem>
          <MenuItem
            data-image-insert-mode="floating"
            @pointerenter="previewMode = 'floating'"
            @focus="previewMode = 'floating'"
            @select="insertImage('floating')"
          >
            <template #icon><ImageIcon /></template>{{ t("image.insertFloating") }}
          </MenuItem>
        </template>
        <template #footer>
          <MenuSeparator />
          <li class="image-insert-menu__placement" role="none">
            <div class="image-insert-menu__diagram">
              <svg viewBox="0 0 240 88" width="240" height="88" aria-hidden="true">
                <path
                  d="M0 0H240V88H0Z M0 29H240 M0 59H240 M60 0V88 M120 0V88 M180 0V88"
                  fill="none"
                  stroke="var(--sheetcraft-border-subtle)"
                />
                <g
                  :transform="
                    previewMode === 'cell' ? 'translate(61 30) scale(.48 .43)' : 'translate(62 12)'
                  "
                >
                  <rect
                    width="116"
                    height="64"
                    rx="3"
                    fill="var(--sheetcraft-action-primary-subtle)"
                    stroke="var(--sheetcraft-action-primary)"
                  />
                  <circle cx="88" cy="17" r="8" fill="var(--sheetcraft-action-primary)" />
                  <path
                    d="M8 56L36 25L56 43L72 31L108 56Z"
                    fill="var(--sheetcraft-action-primary)"
                  />
                </g>
              </svg>
            </div>
            <p class="image-insert-menu__hint">
              {{
                t(
                  previewMode === "cell"
                    ? "image.cellPlacementHint"
                    : "image.floatingPlacementHint",
                )
              }}
            </p>
            <p class="image-insert-menu__limits">{{ t("image.fileLimits") }}</p>
          </li>
        </template>
      </MenuSurface>
    </Teleport>
  </span>
</template>

<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;

.ribbon-menu-tool {
  @include ribbon.tool;
}

.image-insert-menu {
  z-index: var(--sheetcraft-layer-menu);

  &__placement {
    display: grid;
    gap: var(--sheetcraft-space-2);
    inline-size: 264px;
    max-inline-size: calc(100vw - var(--sheetcraft-space-4) * 4);
    padding: var(--sheetcraft-space-2) var(--sheetcraft-space-3) var(--sheetcraft-space-3);
    box-sizing: border-box;
    color: var(--sheetcraft-text-secondary);
  }

  &__diagram {
    overflow: hidden;
    border-radius: var(--sheetcraft-radius-menu-item);
    background: var(--sheetcraft-surface-subtle);

    svg {
      display: block;
      width: 100%;
      height: auto;
    }
  }

  &__hint {
    margin: 0;
    font-size: var(--sheetcraft-font-size-body-small);
    line-height: 1.45;
  }

  &__limits {
    margin: 0;
    padding-top: var(--sheetcraft-space-1);
    border-top: 1px solid var(--sheetcraft-border-divider);
    color: var(--sheetcraft-text-muted);
    font-size: var(--sheetcraft-font-size-body-small);
    line-height: 1.4;
    overflow-wrap: anywhere;
  }
}
</style>
