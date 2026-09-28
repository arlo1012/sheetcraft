<script setup lang="ts">
import { Hash } from "lucide-vue-next";
import { computed, ref, useId } from "vue";
import type { SelectionCellStyleState } from "@idea10/core/style-state";
import { useAppI18n } from "../../../shared/i18n";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuRadioItem from "../../../shared/menu/MenuRadioItem.vue";
import MenuSeparator from "../../../shared/menu/MenuSeparator.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";
import { useMenu } from "../../../shared/menu/useMenu";
import {
  NUMBER_FORMAT_PRESET_CHOICES,
  isNumberFormatPresetSelected,
  type NumberFormatPresetChoice,
} from "../number-format-presets";

const props = defineProps<{
  state: SelectionCellStyleState["numberFormat"];
  disabled: boolean;
}>();
const emit = defineEmits<{
  select: [choice: NumberFormatPresetChoice];
  openCellFormat: [];
}>();
const { locale, t } = useAppI18n();
const buttonRef = ref<InstanceType<typeof RibbonMenuButton> | null>(null);
const triggerRef = computed(() => buttonRef.value?.rootElement ?? null);
const menuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const menuId = `number-format-menu-${useId().replaceAll(":", "")}`;
const currentFormatLabel = computed(() => currentLabel());
const triggerLabel = computed(() =>
  props.state.mixed
    ? t("format.numberFormatMixed")
    : t("format.numberFormatValue", { value: currentFormatLabel.value }),
);
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef,
  menuSurfaceRef,
  disabled: computed(() => props.disabled),
});

function formatLabel(choice: NumberFormatPresetChoice): string {
  if (choice === "general") return t("ribbon.generalFormat");
  if (choice === "number") return t("cellFormat.numeric");
  if (choice === "currency") return t("ribbon.currencyFormat");
  if (choice === "accounting") return t("ribbon.accountingFormat");
  if (choice === "shortDate") return t("ribbon.shortDateFormat");
  if (choice === "longDate") return t("ribbon.longDateFormat");
  if (choice === "time") return t("ribbon.timeFormat");
  if (choice === "percent") return t("ribbon.percentFormat");
  if (choice === "fraction") return t("ribbon.fractionFormat");
  if (choice === "scientific") return t("ribbon.scientificFormat");
  return t("ribbon.textFormat");
}

function currentLabel(): string {
  if (!props.state.value) return formatLabel("general");
  const currentChoice = NUMBER_FORMAT_PRESET_CHOICES.find((choice) =>
    isNumberFormatPresetSelected(choice, props.state, locale.value),
  );
  if (currentChoice) return formatLabel(currentChoice);
  if (props.state.value.kind === "date") return t("cellFormat.date");
  if (props.state.value.kind === "custom") return t("cellFormat.custom");
  if (props.state.value.kind === "special") return t("cellFormat.special");
  return formatLabel(props.state.value.kind);
}

function isSelected(choice: NumberFormatPresetChoice): boolean {
  return isNumberFormatPresetSelected(choice, props.state, locale.value);
}

function select(choice: NumberFormatPresetChoice): void {
  emit("select", choice);
  dismiss();
}

function openCellFormat(): void {
  dismiss("programmatic", false);
  emit("openCellFormat");
}
</script>

<template>
  <div class="number-format-menu">
    <RibbonMenuButton
      ref="buttonRef"
      full-width
      :label="triggerLabel"
      :title="state.mixed ? t('ribbon.numberFormat') : triggerLabel"
      :text="state.mixed ? '' : currentFormatLabel"
      :disabled="disabled"
      :expanded="open"
      :menu-id="menuId"
      data-number-format-trigger
      @activate="toggleMenu"
      @keydown="onTriggerKeydown"
    >
      <Hash aria-hidden="true" />
    </RibbonMenuButton>
    <Teleport to="body">
      <MenuSurface
        v-if="open"
        :id="menuId"
        ref="menuSurfaceRef"
        class="number-format-menu__surface"
        :style="floatingStyles"
        :label="t('ribbon.numberFormat')"
      >
        <MenuRadioItem
          v-for="choice in NUMBER_FORMAT_PRESET_CHOICES"
          :key="choice"
          :data-number-format-option="choice"
          :checked="isSelected(choice)"
          @select="select(choice)"
        >
          {{ formatLabel(choice) }}
        </MenuRadioItem>
        <MenuSeparator />
        <MenuItem data-number-format-more @select="openCellFormat">
          {{ t("ribbon.moreNumberFormats") }}
        </MenuItem>
      </MenuSurface>
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;

.number-format-menu {
  @include ribbon.tool;

  min-width: 62px;

  &__surface {
    z-index: 80;
    max-height: min(480px, calc(100vh - var(--idea-space-4) - var(--idea-space-4)));
  }
}
</style>
