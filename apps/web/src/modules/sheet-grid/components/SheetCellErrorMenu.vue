<script setup lang="ts">
import { ChevronDown, CircleAlert } from "lucide-vue-next";
import { computed, ref, useId, watch } from "vue";
import type { CellAddress } from "@idea10/core/workbook";
import { useAppI18n } from "../../../shared/i18n";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSeparator from "../../../shared/menu/MenuSeparator.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import { useMenu } from "../../../shared/menu/useMenu";
import type { SheetRenderFrame } from "../rendering/sheet-render-frame";

const props = withDefaults(
  defineProps<{
    frame: SheetRenderFrame;
    activeCell: CellAddress;
    visible: boolean;
    disabled?: boolean;
    readOnly?: boolean;
  }>(),
  { disabled: false, readOnly: false },
);
const emit = defineEmits<{
  ignore: [];
  ignoreAll: [];
  editFormulaBar: [];
  options: [];
}>();
const { t } = useAppI18n();
const triggerRef = ref<HTMLButtonElement | null>(null);
const menuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const menuId = `sheet-cell-error-menu-${useId().replaceAll(":", "")}`;
const overlay = computed(() => {
  const rect = props.frame.layout.getCellViewportRect(props.activeCell);
  if (!rect) return { visible: false, style: {} };
  const paneId = props.frame.layout.getPaneForAddress(props.activeCell);
  const pane = props.frame.panes[paneId];
  if (!pane) return { visible: false, style: {} };
  const left = Math.max(0, pane.clip.x, rect.x);
  const right = Math.min(
    props.frame.body.width,
    pane.clip.x + pane.clip.width,
    rect.x + rect.width,
  );
  const top = Math.max(0, pane.clip.y, rect.y);
  const bottom = Math.min(
    props.frame.body.height,
    pane.clip.y + pane.clip.height,
    rect.y + rect.height,
  );
  if (right <= left || bottom <= top) return { visible: false, style: {} };
  const buttonWidth = 34;
  const buttonHeight = 22;
  const maxLeft = props.frame.body.x + Math.max(0, props.frame.body.width - buttonWidth);
  const maxTop = props.frame.body.y + Math.max(0, props.frame.body.height - buttonHeight);
  return {
    visible: true,
    style: {
      left: `${Math.min(maxLeft, Math.max(props.frame.body.x, props.frame.body.x + left - buttonWidth - 4))}px`,
      top: `${Math.min(maxTop, Math.max(props.frame.body.y, props.frame.body.y + top + (bottom - top - buttonHeight) / 2))}px`,
    },
  };
});
const disabled = computed(() => !props.visible || !overlay.value.visible || props.disabled);

const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef,
  menuSurfaceRef,
  disabled,
  placement: "bottom-start",
  offset: 4,
  defaultFocus: "first",
  pointerFocus: "first",
});

function select(action: "ignore" | "ignoreAll" | "editFormulaBar" | "options"): void {
  dismiss("programmatic", false);
  if (action === "ignore") emit("ignore");
  else if (action === "ignoreAll") emit("ignoreAll");
  else if (action === "editFormulaBar") emit("editFormulaBar");
  else emit("options");
}

watch(
  () => [props.visible, props.activeCell.row, props.activeCell.column, overlay.value.visible],
  () => dismiss("programmatic", false),
);
</script>

<template>
  <button
    v-if="visible && overlay.visible"
    ref="triggerRef"
    type="button"
    class="sheet-cell-error-menu__trigger"
    :style="overlay.style"
    :disabled="disabled"
    :aria-label="t('dataTools.duplicates.errorChecks.markerLabel')"
    :aria-controls="open ? menuId : undefined"
    :aria-expanded="open"
    aria-haspopup="menu"
    :title="t('dataTools.duplicates.errorChecks.message')"
    data-sheet-cell-error-trigger
    @pointerdown.prevent.stop
    @click.stop="toggleMenu"
    @keydown.stop="onTriggerKeydown"
  >
    <CircleAlert class="sheet-cell-error-menu__icon" :size="16" aria-hidden="true" />
    <ChevronDown
      class="sheet-cell-error-menu__arrow"
      :class="{ 'sheet-cell-error-menu__arrow--open': open }"
      :size="10"
      aria-hidden="true"
    />
  </button>
  <Teleport to="body">
    <MenuSurface
      v-if="open"
      :id="menuId"
      ref="menuSurfaceRef"
      class="sheet-cell-error-menu__surface"
      :style="floatingStyles"
      :label="t('dataTools.duplicates.errorChecks.markerLabel')"
      :aria-describedby="`${menuId}-message`"
      tabindex="-1"
      @pointerdown.stop
      @click.stop
    >
      <li class="sheet-cell-error-menu__message" role="presentation">
        <p :id="`${menuId}-message`">{{ t("dataTools.duplicates.errorChecks.message") }}</p>
      </li>
      <MenuItem data-sheet-cell-error-action="ignore" @select="select('ignore')">
        {{ t("dataTools.duplicates.errorChecks.ignore") }}
      </MenuItem>
      <MenuItem
        :title="t('dataTools.duplicates.errorChecks.ignoreAllHint')"
        data-sheet-cell-error-action="ignore-all"
        @select="select('ignoreAll')"
      >
        {{ t("dataTools.duplicates.errorChecks.ignoreAll") }}
      </MenuItem>
      <MenuItem
        :disabled="readOnly"
        data-sheet-cell-error-action="edit-formula-bar"
        @select="select('editFormulaBar')"
      >
        {{ t("dataTools.duplicates.errorChecks.editFormulaBar") }}
      </MenuItem>
      <MenuSeparator />
      <MenuItem data-sheet-cell-error-action="options" @select="select('options')">
        {{ t("dataTools.duplicates.errorChecks.optionsLabel") }}
      </MenuItem>
    </MenuSurface>
  </Teleport>
</template>

<style scoped lang="scss">
.sheet-cell-error-menu {
  &__trigger {
    position: absolute;
    z-index: 11;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    width: 34px;
    height: 22px;
    padding: 0 4px;
    color: var(--idea-text-secondary);
    background: var(--idea-surface-panel);
    border: 0;
    border-radius: var(--idea-radius-small);
    cursor: pointer;

    &:hover:not(:disabled),
    &[aria-expanded="true"] {
      background: var(--idea-icon-button-hover-bg);
    }

    &:focus-visible {
      outline: 1px solid var(--idea-action-primary);
      outline-offset: 1px;
    }

    &:disabled {
      cursor: default;
      opacity: 0.55;
    }
  }

  &__icon {
    color: var(--idea-status-warning);
  }

  &__arrow--open {
    transform: rotate(180deg);
  }

  &__surface {
    z-index: 120;
    width: min(184px, calc(100vw - 32px));
  }

  &__message {
    padding: 0 var(--idea-space-4) var(--idea-space-2);
    list-style: none;

    p {
      margin: 0;
      padding: var(--idea-space-3);
      color: var(--idea-text-secondary);
      background: var(--idea-surface-secondary);
      border-radius: var(--idea-radius-small);
      font-size: var(--idea-font-size-body-small);
      line-height: var(--idea-line-height-body-small);
      overflow-wrap: anywhere;
    }
  }
}
</style>
