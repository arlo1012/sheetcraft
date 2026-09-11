<script setup lang="ts">
import { Check, DollarSign, Hash, MoveLeft, MoveRight, Percent } from "lucide-vue-next";
import { computed, nextTick, ref, useId, watch } from "vue";
import type { CellNumberFormat, CellStylePatch } from "@idea10/core/style";
import type { SelectionCellStyleState } from "@idea10/core/style-state";
import { useDismissibleFloatingPanel } from "../../../shared/floating/useDismissibleFloatingPanel";
import { useAppI18n } from "../../../shared/i18n";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import RibbonDialogLauncher from "./RibbonDialogLauncher.vue";
import RibbonIconAction from "./RibbonIconAction.vue";
import RibbonDropdownArrow from "./RibbonDropdownArrow.vue";

type NumberFormatChoice = "general" | CellNumberFormat["kind"];
type NumberFormatShortcut = "number" | "percent" | "currency";

const props = defineProps<{
  state: SelectionCellStyleState;
  disabled: boolean;
}>();

const emit = defineEmits<{
  applyStyle: [patch: CellStylePatch];
  adjustDecimals: [delta: -1 | 1];
  openCellFormat: [];
}>();

const { locale, t } = useAppI18n();
const triggerRef = ref<HTMLButtonElement | null>(null);
const menuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const menuRef = computed<HTMLElement | null>(() => menuSurfaceRef.value?.rootElement ?? null);
const open = ref(false);
const menuId = `number-format-menu-${useId().replaceAll(":", "")}`;
const currentFormat = computed(() => props.state.numberFormat.value);
const currentChoice = computed<NumberFormatChoice>(() => currentFormat.value?.kind ?? "general");
const currentFormatLabel = computed(() => formatLabel(currentChoice.value));
const canAdjustDecimals = computed(() => {
  const kind = currentFormat.value?.kind;
  return !kind || ["number", "percent", "currency", "accounting", "scientific"].includes(kind);
});
const triggerLabel = computed(() =>
  props.state.numberFormat.mixed
    ? t("format.numberFormatMixed")
    : t("format.numberFormatValue", { value: currentFormatLabel.value }),
);
const { floatingStyles, dismiss } = useDismissibleFloatingPanel(triggerRef, menuRef, open, {
  offset: 4,
  onDismiss: () => {
    open.value = false;
  },
});

function formatLabel(choice: NumberFormatChoice): string {
  if (choice === "general") return t("ribbon.generalFormat");
  if (choice === "number") return t("ribbon.numberFormat");
  if (choice === "percent") return t("ribbon.percentFormat");
  if (choice === "currency") return t("ribbon.currencyFormat");
  if (choice === "accounting") return t("cellFormat.accounting");
  if (choice === "date") return t("cellFormat.date");
  if (choice === "time") return t("cellFormat.time");
  if (choice === "fraction") return t("cellFormat.fraction");
  if (choice === "scientific") return t("cellFormat.scientific");
  if (choice === "text") return t("cellFormat.text");
  if (choice === "special") return t("cellFormat.special");
  return t("cellFormat.custom");
}

function defaultCurrency(): "CNY" | "USD" {
  return locale.value === "zh-CN" ? "CNY" : "USD";
}

function selectedCurrency(): string {
  return currentFormat.value?.kind === "currency"
    ? currentFormat.value.currency
    : defaultCurrency();
}

function formatPatch(choice: NumberFormatShortcut): CellStylePatch {
  if (choice === "number") {
    return { numberFormat: { kind: "number", fractionDigits: 2 } };
  }
  if (choice === "percent") {
    return { numberFormat: { kind: "percent", fractionDigits: 0 } };
  }
  return { numberFormat: { kind: "currency", currency: selectedCurrency(), fractionDigits: 2 } };
}

function isSelected(choice: NumberFormatChoice): boolean {
  return !props.state.numberFormat.mixed && currentChoice.value === choice;
}

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
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    openMenu(event.key === "ArrowUp" ? "last" : "first");
  }
}

function selectFormat(choice: "general" | NumberFormatShortcut): void {
  emit("applyStyle", choice === "general" ? { numberFormat: null } : formatPatch(choice));
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
  <section
    class="home-number-group"
    data-ribbon-group="number"
    role="group"
    :aria-label="t('ribbon.numberTools')"
    :aria-disabled="disabled"
    :title="disabled ? t('format.selectionTooLarge') : undefined"
  >
    <div class="home-number-group__row" data-ribbon-row="1">
      <button
        ref="triggerRef"
        type="button"
        class="home-number-group__format-trigger"
        :class="{ 'is-expanded': open, 'is-mixed': state.numberFormat.mixed }"
        data-number-format-trigger
        :disabled="disabled"
        :aria-label="triggerLabel"
        :title="triggerLabel"
        aria-haspopup="menu"
        :aria-expanded="open"
        :aria-controls="open ? menuId : undefined"
        @click="toggleMenu"
        @keydown="onTriggerKeydown"
      >
        <Hash :size="15" aria-hidden="true" />
        <span class="home-number-group__format-label" aria-hidden="true">
          {{ state.numberFormat.mixed ? t("format.mixed") : currentFormatLabel }}
        </span>
        <RibbonDropdownArrow :expanded="open" />
      </button>
    </div>
    <div class="home-number-group__row" data-ribbon-row="2">
      <RibbonIconAction
        :label="t('ribbon.percentFormat')"
        :disabled="disabled"
        data-ribbon-action="percent-format"
        @activate="selectFormat('percent')"
      >
        <Percent :size="15" aria-hidden="true" />
      </RibbonIconAction>
      <RibbonIconAction
        :label="t('ribbon.currencyFormat')"
        :disabled="disabled"
        data-ribbon-action="currency-format"
        @activate="selectFormat('currency')"
      >
        <DollarSign :size="15" aria-hidden="true" />
      </RibbonIconAction>
      <RibbonIconAction
        :label="t('ribbon.decreaseDecimal')"
        :disabled="disabled || !canAdjustDecimals"
        data-ribbon-action="decrease-decimal"
        @activate="emit('adjustDecimals', -1)"
      >
        <MoveLeft :size="15" aria-hidden="true" />
      </RibbonIconAction>
      <RibbonIconAction
        :label="t('ribbon.increaseDecimal')"
        :disabled="disabled || !canAdjustDecimals"
        data-ribbon-action="increase-decimal"
        @activate="emit('adjustDecimals', 1)"
      >
        <MoveRight :size="15" aria-hidden="true" />
      </RibbonIconAction>
    </div>
    <RibbonDialogLauncher
      :label="`${t('cellFormat.title')} · ${t('cellFormat.number')}`"
      :disabled="disabled"
      data-ribbon-dialog-launcher="number"
      @activate="emit('openCellFormat')"
    />
  </section>

  <Teleport to="body">
    <MenuSurface
      v-if="open"
      :id="menuId"
      ref="menuSurfaceRef"
      class="home-number-group__menu"
      :style="floatingStyles"
      :label="t('ribbon.numberFormat')"
    >
      <MenuItem
        v-for="choice in ['general', 'number', 'percent', 'currency'] as const"
        :key="choice"
        :data-number-format-option="choice"
        :aria-checked="isSelected(choice)"
        role="menuitemradio"
        @select="selectFormat(choice)"
      >
        {{ formatLabel(choice) }}
        <template #icon>
          <Check v-if="isSelected(choice)" :size="15" aria-hidden="true" />
        </template>
      </MenuItem>
    </MenuSurface>
  </Teleport>
</template>

<style scoped lang="scss">
@use "../styles/ribbon-groups" as ribbon;

.home-number-group {
  @include ribbon.compact;
  @include ribbon.dialog-launcher-anchor;

  &__row {
    @include ribbon.row;
  }

  &__format-trigger {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 62px;
    height: 26px;
    gap: 2px;
    padding: 0 3px;
    color: var(--idea-text-primary);
    font: inherit;
    font-size: var(--idea-font-size-body-medium);
    line-height: var(--idea-line-height-body-medium);
    background: transparent;
    border: 1px solid transparent;
    border-radius: 2px;
    cursor: pointer;

    &:hover:not(:disabled),
    &.is-expanded {
      background: var(--idea-surface-hover);
    }

    &:focus-visible {
      border-color: var(--idea-action-primary);
      outline: none;
      box-shadow: 0 0 0 2px var(--idea-action-focus);
    }

    &:disabled {
      color: var(--idea-text-secondary);
      cursor: default;
    }
  }

  &__format-label {
    max-width: 46px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__menu {
    z-index: 30;
    min-width: 150px;
  }
}
</style>
