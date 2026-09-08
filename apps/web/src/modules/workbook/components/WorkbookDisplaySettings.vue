<script setup lang="ts">
import { Check, Settings, Table2 } from "lucide-vue-next";
import { computed, nextTick, ref, useId } from "vue";
import { useDismissibleFloatingPanel } from "../../../shared/floating/useDismissibleFloatingPanel";
import { useAppI18n } from "../../../shared/i18n";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSeparator from "../../../shared/menu/MenuSeparator.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";

defineProps<{
  showHeaders: boolean;
  showGridLines: boolean;
  showAxisQuickTools: boolean;
}>();
const emit = defineEmits<{
  "update:showHeaders": [value: boolean];
  "update:showGridLines": [value: boolean];
  "update:showAxisQuickTools": [value: boolean];
}>();
const { t } = useAppI18n();
const triggerRef = ref<HTMLButtonElement | null>(null);
const menuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const menuRef = computed(() => menuSurfaceRef.value?.rootElement ?? null);
const open = ref(false);
const menuId = `workbook-display-settings-${useId().replaceAll(":", "")}`;
const { floatingStyles, dismiss } = useDismissibleFloatingPanel(triggerRef, menuRef, open, {
  offset: 6,
  placement: "top-end",
  onDismiss: () => {
    open.value = false;
  },
});

function openMenu(focus: "first" | "last" = "first"): void {
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
</script>

<template>
  <button
    ref="triggerRef"
    class="workbook-display-settings__trigger"
    type="button"
    :aria-label="t('statusBar.displaySettings')"
    :title="t('statusBar.displaySettings')"
    :aria-controls="open ? menuId : undefined"
    :aria-expanded="open"
    aria-haspopup="menu"
    data-view-control="display-settings"
    @click="toggleMenu"
    @keydown="onTriggerKeydown"
  >
    <span class="workbook-display-settings__icon" aria-hidden="true">
      <Table2 :size="15" :stroke-width="1.7" />
      <Settings class="workbook-display-settings__icon-cog" :size="7" :stroke-width="2" />
    </span>
  </button>

  <Teleport to="body">
    <MenuSurface
      v-if="open"
      :id="menuId"
      ref="menuSurfaceRef"
      class="workbook-display-settings__menu"
      :style="floatingStyles"
      :label="t('statusBar.displaySettings')"
      data-display-settings-menu
    >
      <MenuItem
        role="menuitemcheckbox"
        :aria-checked="showHeaders"
        data-display-option="headers"
        @select="emit('update:showHeaders', !showHeaders)"
      >
        <template #icon><Check v-if="showHeaders" :size="15" /></template>
        {{ t("statusBar.showHeaders") }}
      </MenuItem>
      <MenuItem
        role="menuitemcheckbox"
        :aria-checked="showGridLines"
        data-display-option="grid-lines"
        @select="emit('update:showGridLines', !showGridLines)"
      >
        <template #icon><Check v-if="showGridLines" :size="15" /></template>
        {{ t("statusBar.showGridLines") }}
      </MenuItem>
      <MenuSeparator />
      <MenuItem
        role="menuitemcheckbox"
        :aria-checked="showAxisQuickTools"
        data-display-option="axis-quick-tools"
        @select="emit('update:showAxisQuickTools', !showAxisQuickTools)"
      >
        <template #icon><Check v-if="showAxisQuickTools" :size="15" /></template>
        {{ t("statusBar.axisQuickTools") }}
      </MenuItem>
    </MenuSurface>
  </Teleport>
</template>

<style scoped lang="scss">
.workbook-display-settings {
  &__trigger {
    display: grid;
    place-items: center;
    flex: 0 0 24px;
    width: 24px;
    height: 22px;
    padding: 0;
    border: 0;
    border-radius: var(--idea-radius-small);
    background: transparent;
    color: var(--idea-text-secondary);
    cursor: pointer;

    &:hover,
    &[aria-expanded="true"] {
      background: var(--idea-icon-button-hover-bg);
    }

    &:focus-visible {
      outline: 2px solid var(--idea-action-primary);
      outline-offset: -2px;
    }
  }

  &__icon {
    position: relative;
    display: grid;
    width: 15px;
    height: 15px;
  }

  &__icon-cog {
    position: absolute;
    right: -1px;
    bottom: -1px;
    box-sizing: content-box;
    padding: 1px;
    border-radius: 2px;
    background: var(--idea-sheet-bar-surface);
  }

  &__menu {
    min-width: 180px;
  }
}
</style>
