<script setup lang="ts">
import { DollarSign } from "lucide-vue-next";
import { computed, ref, useId } from "vue";
import type { SelectionCellStyleState } from "@idea10/core/style-state";
import { useAppI18n } from "../../../shared/i18n";
import RibbonSplitButton from "../../../shared/ribbon/RibbonSplitButton.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import MenuRadioItem from "../../../shared/menu/MenuRadioItem.vue";
import { useMenu } from "../../../shared/menu/useMenu";

const props = defineProps<{ state: SelectionCellStyleState["numberFormat"]; disabled: boolean }>();
const emit = defineEmits<{ select: [choice: "currency" | "accounting"] }>();
const { t } = useAppI18n();
const lastChoice = ref<"currency" | "accounting">("currency");
const actionLabel = computed(() =>
  t(lastChoice.value === "currency" ? "ribbon.currencyFormat" : "ribbon.accountingFormat"),
);
const buttonRef = ref<InstanceType<typeof RibbonSplitButton> | null>(null);
const triggerRef = computed(() => buttonRef.value?.menuElement ?? null);
const menuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const menuId = useId();
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef,
  menuSurfaceRef,
  disabled: computed(() => props.disabled),
});
function select(choice: "currency" | "accounting"): void {
  if (props.disabled) return;
  lastChoice.value = choice;
  emit("select", choice);
  dismiss();
}
</script>

<template>
  <div class="currency-format-control">
    <RibbonSplitButton
      ref="buttonRef"
      :label="actionLabel"
      :menu-label="`${t('ribbon.currencyFormat')} / ${t('ribbon.accountingFormat')}`"
      :disabled="disabled"
      :menu-disabled="disabled"
      :expanded="open"
      :menu-id="menuId"
      data-ribbon-action="currency-format"
      @activate="select(lastChoice)"
      @toggle-menu="toggleMenu"
      @menu-keydown="onTriggerKeydown"
      ><DollarSign
    /></RibbonSplitButton>
    <Teleport to="body">
      <MenuSurface
        v-if="open"
        :id="menuId"
        ref="menuSurfaceRef"
        class="currency-format-control__menu"
        :style="floatingStyles"
        :label="t('ribbon.currencyFormat')"
      >
        <MenuRadioItem
          :checked="!state.mixed && state.value?.kind === 'currency'"
          data-currency-format="currency"
          @select="select('currency')"
          >{{ t("ribbon.currencyFormat") }}</MenuRadioItem
        >
        <MenuRadioItem
          :checked="!state.mixed && state.value?.kind === 'accounting'"
          data-currency-format="accounting"
          @select="select('accounting')"
          >{{ t("ribbon.accountingFormat") }}</MenuRadioItem
        >
      </MenuSurface>
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;
.currency-format-control {
  @include ribbon.tool;
  flex: 0 0 auto;
  &__menu {
    z-index: var(--idea-layer-menu);
  }
}
</style>
