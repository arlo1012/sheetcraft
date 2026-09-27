<script setup lang="ts">
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";
import { TableProperties } from "lucide-vue-next";
import { useAppI18n } from "../../../shared/i18n";
import ConditionalFormattingMenu, {
  type ConditionalFormatQuickRule,
} from "../../conditional-formatting/components/ConditionalFormattingMenu.vue";

defineProps<{ disabled?: boolean; editSessionId?: string }>();
const emit = defineEmits<{
  createConditionalFormat: [kind: ConditionalFormatQuickRule];
  manageConditionalFormats: [];
  clearConditionalFormats: [scope: "selection" | "sheet"];
}>();

const { t } = useAppI18n();
</script>

<template>
  <section
    class="home-styles-group"
    data-ribbon-group="styles"
    role="group"
    :aria-label="t('format.styleRuleTools')"
  >
    <div class="home-styles-group__row" data-ribbon-row="1">
      <RibbonMenuButton
        full-width
        :label="t('app.unavailableFeature', { feature: t('ribbon.tableStyles') })"
        :text="t('ribbon.tableStyles')"
        disabled
        data-ribbon-placeholder="table-styles"
      >
        <TableProperties aria-hidden="true" />
      </RibbonMenuButton>
    </div>
    <div class="home-styles-group__row" data-ribbon-row="2">
      <ConditionalFormattingMenu
        :disabled="disabled"
        :edit-session-id="editSessionId"
        @create="emit('createConditionalFormat', $event)"
        @manage="emit('manageConditionalFormats')"
        @clear="emit('clearConditionalFormats', $event)"
      />
    </div>
  </section>
</template>

<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;

.home-styles-group {
  @include ribbon.compact;

  &__row {
    @include ribbon.row;
  }
}
</style>
