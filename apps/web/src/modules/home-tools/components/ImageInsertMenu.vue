<script setup lang="ts">
import { Image as ImageIcon, PictureInPicture2 } from "lucide-vue-next";
import { computed, nextTick, ref, useId, watch } from "vue";
import { useDismissibleFloatingPanel } from "../../../shared/floating/useDismissibleFloatingPanel";
import { useAppI18n } from "../../../shared/i18n";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import RibbonIconAction from "./RibbonIconAction.vue";

defineOptions({ inheritAttrs: false });

const props = defineProps<{ disabled: boolean }>();
const emit = defineEmits<{ insertImage: [mode: "cell" | "floating"] }>();
const { t } = useAppI18n();
const triggerComponentRef = ref<InstanceType<typeof RibbonIconAction> | null>(null);
const triggerRef = computed(() => triggerComponentRef.value?.rootElement ?? null);
const menuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const menuRef = computed<HTMLElement | null>(() => menuSurfaceRef.value?.rootElement ?? null);
const open = ref(false);
const menuId = `image-insert-menu-${useId().replaceAll(":", "")}`;
const { floatingStyles, dismiss } = useDismissibleFloatingPanel(triggerRef, menuRef, open, {
  offset: 4,
  onDismiss: () => {
    open.value = false;
  },
});

function openMenu(focus: "first" | "last" = "first"): void {
  if (props.disabled) return;
  open.value = true;
  void nextTick(() =>
    focus === "last"
      ? menuSurfaceRef.value?.focusLastItem()
      : menuSurfaceRef.value?.focusFirstItem(),
  );
}

function toggleMenu(): void {
  if (open.value) dismiss("programmatic", true);
  else openMenu();
}

function onTriggerKeydown(event: KeyboardEvent): void {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  event.preventDefault();
  openMenu(event.key === "ArrowDown" ? "first" : "last");
}

function insertImage(mode: "cell" | "floating"): void {
  emit("insertImage", mode);
  dismiss("programmatic", true);
}

watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) dismiss("programmatic", false);
  },
);
</script>

<template>
  <RibbonIconAction
    ref="triggerComponentRef"
    v-bind="$attrs"
    :label="t('image.insertMenu')"
    :text="t('ribbon.image')"
    :disabled="disabled"
    variant="tall"
    disclosure
    data-ribbon-action="image"
    data-ribbon-layout="tall"
    data-ribbon-span="2"
    aria-haspopup="menu"
    :aria-expanded="open"
    :aria-controls="open ? menuId : undefined"
    @activate="toggleMenu"
    @keydown="onTriggerKeydown"
  >
    <ImageIcon :size="17" aria-hidden="true" />
  </RibbonIconAction>

  <Teleport to="body">
    <MenuSurface
      v-if="open"
      :id="menuId"
      ref="menuSurfaceRef"
      class="image-insert-menu"
      :style="floatingStyles"
      :label="t('image.insertMenu')"
    >
      <MenuItem data-image-insert-mode="cell" @select="insertImage('cell')">
        <template #icon><ImageIcon :size="15" /></template>
        {{ t("image.insertInCell") }}
      </MenuItem>
      <MenuItem data-image-insert-mode="floating" @select="insertImage('floating')">
        <template #icon><PictureInPicture2 :size="15" /></template>
        {{ t("image.insertFloating") }}
      </MenuItem>
    </MenuSurface>
  </Teleport>
</template>

<style scoped lang="scss">
.image-insert-menu {
  position: fixed;
  z-index: 80;
  min-width: 168px;
}
</style>
