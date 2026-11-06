<script setup lang="ts">
import { Image as ImageIcon, FolderOpen } from "lucide-vue-next";
import { computed, ref, useId } from "vue";
import { useAppI18n } from "../../../shared/i18n";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuRadioItem from "../../../shared/menu/MenuRadioItem.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";
import { useMenu } from "../../../shared/menu/useMenu";

defineOptions({ inheritAttrs: false });

const props = withDefaults(defineProps<{ disabled: boolean; compact?: boolean; text?: string }>(), {
  compact: false,
});
const emit = defineEmits<{ insertImage: [mode: "cell" | "floating"] }>();
const { t } = useAppI18n();
const mode = ref<"cell" | "floating">("cell");
const triggerComponentRef = ref<InstanceType<typeof RibbonMenuButton> | null>(null);
const triggerRef = computed(() => triggerComponentRef.value?.rootElement ?? null);
const menuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const menuId = `image-insert-menu-${useId().replaceAll(":", "")}`;
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef,
  menuSurfaceRef,
  disabled: computed(() => props.disabled),
});

function insertImage(): void {
  if (props.disabled) return;
  dismiss("programmatic", false);
  emit("insertImage", mode.value);
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
          <MenuRadioItem
            :checked="mode === 'cell'"
            data-image-insert-mode="cell"
            @select="mode = 'cell'"
          >
            {{ t("image.insertInCell") }}
          </MenuRadioItem>
          <MenuRadioItem
            :checked="mode === 'floating'"
            data-image-insert-mode="floating"
            @select="mode = 'floating'"
          >
            {{ t("image.insertFloating") }}
          </MenuRadioItem>
        </template>
        <template #footer>
          <li class="image-insert-menu__placement" role="none">
            <svg viewBox="0 0 240 88" width="240" height="88" aria-hidden="true">
              <path
                d="M0 0H240V88H0Z M0 29H240 M0 59H240 M60 0V88 M120 0V88 M180 0V88"
                fill="none"
                stroke="var(--sheetcraft-border-subtle)"
              />
              <g
                :transform="
                  mode === 'cell' ? 'translate(61 30) scale(.48 .43)' : 'translate(62 12)'
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
                <path d="M8 56L36 25L56 43L72 31L108 56Z" fill="var(--sheetcraft-action-primary)" />
              </g>
            </svg>
            <p>
              {{ t(mode === "cell" ? "image.cellPlacementHint" : "image.floatingPlacementHint") }}
            </p>
          </li>
          <MenuItem data-image-insert-local @select="insertImage">
            <template #icon><FolderOpen /></template>{{ t("image.fromFile") }}
          </MenuItem>
          <li class="image-insert-menu__limits" role="none">{{ t("image.fileLimits") }}</li>
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
    padding: 12px;
    inline-size: 20rem;
    max-inline-size: calc(100vw - var(--sheetcraft-space-4) * 4);
    box-sizing: border-box;
    color: var(--sheetcraft-text-secondary);
    svg {
      display: block;
      width: 100%;
      height: auto;
    }
    p {
      margin: 8px 0 0;
    }
  }

  &__limits {
    inline-size: 20rem;
    max-inline-size: calc(100vw - var(--sheetcraft-space-4) * 4);
    padding: var(--sheetcraft-space-2);
    color: var(--sheetcraft-text-muted);
    font-size: var(--sheetcraft-font-size-body-small);
    line-height: 1.5;
    overflow-wrap: anywhere;
  }
}
</style>
