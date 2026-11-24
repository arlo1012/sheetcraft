<script setup lang="ts">
import { computed, ref, useId, watch } from "vue";
import { Star, LibraryBig } from "lucide-vue-next";
import { Dialog as TDialog } from "tdesign-vue-next/es/dialog";
import { isSheetIconId, type SheetIconId } from "@sheetcraft/core/sheet-icons";
import { useAppI18n } from "../../../shared/i18n";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import { useMenu } from "../../../shared/menu/useMenu";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";
import IconLibraryPane from "./IconLibraryPane.vue";
import type { IconFilter } from "../icon-catalog";

const props = defineProps<{
  disabled: boolean;
  ownerId?: string | number;
  handler: (id: SheetIconId) => boolean;
  compact?: boolean;
  fullWidth?: boolean;
}>();
const { t } = useAppI18n();
const button = ref<InstanceType<typeof RibbonMenuButton>>();
const surface = ref<InstanceType<typeof MenuSurface>>();
const menuId = `icon-insert-${useId().replaceAll(":", "")}`;
const rejected = ref(false),
  full = ref(false),
  query = ref(""),
  filter = ref<IconFilter>("all");
const favorites = ref<SheetIconId[]>([]),
  storageFailed = ref(false);
const favoritesKey = "sheetcraft.icon-favorites";
function loadFavorites() {
  if (storageFailed.value) return;
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(favoritesKey) ?? "[]");
    favorites.value = Array.isArray(stored) ? [...new Set(stored.filter(isSheetIconId))] : [];
  } catch {
    storageFailed.value = true;
  }
}
function toggleFavorite(id: SheetIconId) {
  favorites.value = favorites.value.includes(id)
    ? favorites.value.filter((item) => item !== id)
    : [...favorites.value, id];
  try {
    localStorage.setItem(favoritesKey, JSON.stringify(favorites.value));
    storageFailed.value = false;
  } catch {
    storageFailed.value = true;
  }
}
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef: computed(() => button.value?.rootElement ?? null),
  menuSurfaceRef: computed(() => surface.value ?? null),
  disabled: computed(() => props.disabled),
  onOpen: () => {
    rejected.value = false;
    query.value = "";
    filter.value = "all";
    loadFavorites();
  },
});
function insert(id: SheetIconId): void {
  if ((!open.value && !full.value) || props.disabled) return;
  if (props.handler(id)) {
    full.value = false;
    dismiss("programmatic", false);
  } else rejected.value = true;
}
function expand() {
  if (!open.value || props.disabled) return;
  dismiss("programmatic", false);
  full.value = true;
}
watch(
  () => [props.ownerId, props.disabled],
  () => {
    dismiss("programmatic", false);
    full.value = false;
  },
  { flush: "sync" },
);
</script>

<template>
  <span class="icon-insert-tool" :class="{ 'is-full-width': fullWidth }">
    <RibbonMenuButton
      ref="button"
      :variant="compact ? 'compact' : 'tall'"
      :full-width="fullWidth"
      :label="t('drawing.icon')"
      :text="t('drawing.icon')"
      :disabled="disabled"
      :expanded="open"
      :menu-id="menuId"
      popup-role="menu"
      data-insert-tool="icon"
      @activate="toggleMenu"
      @keydown="onTriggerKeydown"
      ><Star aria-hidden="true"
    /></RibbonMenuButton>
    <Teleport to="body">
      <MenuSurface
        v-if="open"
        :id="menuId"
        ref="surface"
        class="icon-insert-menu"
        :style="floatingStyles"
        :label="t('drawing.icon')"
      >
        <template #body
          ><IconLibraryPane
            v-model:query="query"
            v-model:filter="filter"
            :favorites="favorites"
            :rejected="rejected"
            :storage-failed="storageFailed"
            @favorite="toggleFavorite"
            @insert="insert"
        /></template>
        <template #footer
          ><MenuItem data-icon-more @select="expand"
            ><template #icon><LibraryBig :size="16" /></template
            >{{ t("drawing.icons.more") }}</MenuItem
          ></template
        >
      </MenuSurface>
    </Teleport>
    <TDialog
      v-if="full"
      :visible="true"
      role="dialog"
      aria-modal="true"
      :header="t('drawing.icons.library')"
      :aria-label="t('drawing.icons.library')"
      width="min(820px, calc(100vw - 24px))"
      :footer="false"
      @close="full = false"
    >
      <IconLibraryPane
        full
        v-model:query="query"
        v-model:filter="filter"
        :favorites="favorites"
        :rejected="rejected"
        :storage-failed="storageFailed"
        @favorite="toggleFavorite"
        @insert="insert"
      />
    </TDialog>
  </span>
</template>

<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;
.icon-insert-tool {
  @include ribbon.tool;
  &.is-full-width {
    display: flex;
    width: 100%;
  }
}
.icon-insert-menu {
  z-index: var(--sheetcraft-layer-menu);
  width: min(536px, calc(100vw - 16px));
  max-width: calc(100vw - 16px);
}
</style>
