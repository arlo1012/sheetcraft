<script setup lang="ts">
import { Check, Hash } from "lucide-vue-next";
import { computed, ref, useId } from "vue";
import type { CellNumberFormat } from "@idea10/core/style";
import type { SelectionCellStyleState } from "@idea10/core/style-state";
import { useAppI18n } from "../../../shared/i18n";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";
import { useRibbonMenu } from "../../../shared/ribbon/useRibbonMenu";

type NumberFormatChoice = "general" | CellNumberFormat["kind"];
const props = defineProps<{
  state: SelectionCellStyleState["numberFormat"];
  disabled: boolean;
}>();
const emit = defineEmits<{ select: [choice: "general" | "number" | "percent" | "currency"] }>();
const { t } = useAppI18n();
const buttonRef = ref<InstanceType<typeof RibbonMenuButton> | null>(null);
const triggerRef = computed(() => buttonRef.value?.rootElement ?? null);
const menuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const menuId = `number-format-menu-${useId().replaceAll(":", "")}`;
const currentChoice = computed<NumberFormatChoice>(() => props.state.value?.kind ?? "general");
const currentFormatLabel = computed(() => formatLabel(currentChoice.value));
const triggerLabel = computed(() =>
  props.state.mixed
    ? t("format.numberFormatMixed")
    : t("format.numberFormatValue", { value: currentFormatLabel.value }),
);
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useRibbonMenu({
  triggerRef,
  menuSurfaceRef,
  disabled: computed(() => props.disabled),
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

function isSelected(choice: NumberFormatChoice): boolean {
  return !props.state.mixed && currentChoice.value === choice;
}
function select(choice: "general" | "number" | "percent" | "currency"): void {
  emit("select", choice);
  dismiss();
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
      <Hash :size="15" aria-hidden="true" />
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
        <MenuItem
          v-for="choice in ['general', 'number', 'percent', 'currency'] as const"
          :key="choice"
          :data-number-format-option="choice"
          :aria-checked="isSelected(choice)"
          role="menuitemradio"
          @select="select(choice)"
        >
          {{ formatLabel(choice) }}
          <template #icon>
            <Check v-if="isSelected(choice)" :size="15" aria-hidden="true" />
          </template>
        </MenuItem>
      </MenuSurface>
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
.number-format-menu {
  min-width: 62px;

  &__surface {
    z-index: 80;
    min-width: 150px;
  }
}
</style>
