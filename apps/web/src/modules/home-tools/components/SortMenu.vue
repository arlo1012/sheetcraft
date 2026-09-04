<script setup lang="ts">
import { ArrowDownAZ, ArrowUpAZ } from "lucide-vue-next";
import { computed, nextTick, ref, useId, watch } from "vue";
import { useDismissibleFloatingPanel } from "../../../shared/floating/useDismissibleFloatingPanel";
import { useAppI18n } from "../../../shared/i18n";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import RibbonIconAction from "./RibbonIconAction.vue";

defineOptions({ inheritAttrs: false });

const props = defineProps<{ disabled: boolean }>();
const emit = defineEmits<{ sort: [direction: "ascending" | "descending"] }>();
const { t } = useAppI18n();
const triggerComponentRef = ref<InstanceType<typeof RibbonIconAction> | null>(null);
const triggerRef = computed(() => triggerComponentRef.value?.rootElement ?? null);
const menuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const menuRef = computed<HTMLElement | null>(() => menuSurfaceRef.value?.rootElement ?? null);
const open = ref(false);
const menuId = `sort-menu-${useId().replaceAll(":", "")}`;
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

function select(direction: "ascending" | "descending"): void {
  emit("sort", direction);
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
    :label="t('ribbon.sort')"
    :disabled="disabled"
    disclosure
    data-ribbon-action="sort"
    aria-haspopup="menu"
    :aria-expanded="open"
    :aria-controls="open ? menuId : undefined"
    @activate="toggleMenu"
    @keydown="onTriggerKeydown"
  >
    <ArrowDownAZ :size="15" aria-hidden="true" />
  </RibbonIconAction>

  <Teleport to="body">
    <MenuSurface
      v-if="open"
      :id="menuId"
      ref="menuSurfaceRef"
      class="sort-menu"
      :style="floatingStyles"
      :label="t('ribbon.sort')"
    >
      <MenuItem data-sort-direction="ascending" @select="select('ascending')">
        <template #icon><ArrowUpAZ :size="15" /></template>
        {{ t("ribbon.sortAscending") }}
      </MenuItem>
      <MenuItem data-sort-direction="descending" @select="select('descending')">
        <template #icon><ArrowDownAZ :size="15" /></template>
        {{ t("ribbon.sortDescending") }}
      </MenuItem>
    </MenuSurface>
  </Teleport>
</template>

<style scoped lang="scss">
.sort-menu {
  position: fixed;
  z-index: 80;
  min-width: 168px;
}
</style>
