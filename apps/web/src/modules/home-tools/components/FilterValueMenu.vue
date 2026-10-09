<script setup lang="ts">
import { Check, Funnel } from "lucide-vue-next";
import { computed, ref, useId } from "vue";
import { useAppI18n } from "../../../shared/i18n";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSeparator from "../../../shared/menu/MenuSeparator.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";
import { useMenu } from "../../../shared/menu/useMenu";
import {
  areFilterValueKeysEqual,
  type FilterValueKey,
  type FilterValueOption,
} from "./data-tool-state";

defineOptions({ inheritAttrs: false });

const props = defineProps<{
  disabled: boolean;
  active: boolean;
  options: readonly FilterValueOption[];
  appliedKeys: readonly FilterValueKey[];
}>();
const emit = defineEmits<{
  apply: [includedKeys: FilterValueKey[]];
  clearFilter: [];
}>();
const { t } = useAppI18n();
const triggerComponentRef = ref<InstanceType<typeof RibbonMenuButton> | null>(null);
const triggerRef = computed(() => triggerComponentRef.value?.rootElement ?? null);
const menuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const draftKeys = ref<FilterValueKey[]>([]);
const menuId = `filter-values-menu-${useId().replaceAll(":", "")}`;
const allSelected = computed(
  () => props.options.length > 0 && props.options.every((option) => isDraftIncluded(option.key)),
);

function cloneKeys(keys: readonly FilterValueKey[]): FilterValueKey[] {
  return keys.map((key) => ({ ...key }));
}

function isDraftIncluded(key: FilterValueKey): boolean {
  return draftKeys.value.some((draft) => areFilterValueKeysEqual(draft, key));
}

const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef,
  menuSurfaceRef,
  disabled: computed(() => props.disabled),
  onOpen() {
    draftKeys.value = cloneKeys(props.appliedKeys);
  },
});

function toggleValue(key: FilterValueKey): void {
  draftKeys.value = isDraftIncluded(key)
    ? draftKeys.value.filter((draft) => !areFilterValueKeysEqual(draft, key))
    : [...draftKeys.value, { ...key }];
}

function selectAll(): void {
  draftKeys.value = props.options.map((option) => ({ ...option.key }));
}

function clearDraft(): void {
  draftKeys.value = [];
}

function apply(): void {
  emit("apply", cloneKeys(draftKeys.value));
  dismiss("programmatic", true);
}

function clearFilter(): void {
  emit("clearFilter");
  dismiss("programmatic", true);
}
</script>

<template>
  <span v-bind="$attrs" class="ribbon-menu-tool">
    <RibbonMenuButton
      ref="triggerComponentRef"
      variant="tall"
      :label="t('ribbon.filter')"
      :text="t('ribbon.filter')"
      :disabled="disabled"
      :pressed="active"
      data-ribbon-action="filter"
      popup-role="menu"
      :expanded="open"
      :menu-id="menuId"
      @activate="toggleMenu"
      @keydown="onTriggerKeydown"
    >
      <Funnel aria-hidden="true" />
    </RibbonMenuButton>

    <Teleport to="body">
      <MenuSurface
        v-if="open"
        :id="menuId"
        ref="menuSurfaceRef"
        class="filter-value-menu"
        :style="floatingStyles"
        :label="t('ribbon.filterValues')"
      >
        <MenuItem v-if="active" data-filter-action="clear-filter" @select="clearFilter">
          {{ t("ribbon.clearFilter") }}
        </MenuItem>
        <MenuSeparator v-if="active" />
        <MenuItem data-filter-action="select-all" :disabled="allSelected" @select="selectAll">
          {{ t("ribbon.selectAll") }}
        </MenuItem>
        <MenuItem
          data-filter-action="clear-selection"
          :disabled="draftKeys.length === 0"
          @select="clearDraft"
        >
          {{ t("ribbon.clearSelection") }}
        </MenuItem>
        <MenuSeparator />
        <MenuItem
          v-for="option in options"
          :key="`${option.key.kind}:${option.label}`"
          role="menuitemcheckbox"
          :aria-checked="isDraftIncluded(option.key)"
          :data-filter-value-kind="option.key.kind"
          @select="toggleValue(option.key)"
        >
          <template #icon>
            <Check v-if="isDraftIncluded(option.key)" :size="15" />
          </template>
          {{ option.label }}
          <template v-if="option.count !== undefined" #shortcut>{{ option.count }}</template>
        </MenuItem>
        <MenuSeparator />
        <MenuItem data-filter-action="apply" @select="apply">
          {{ t("ribbon.applyFilter") }}
        </MenuItem>
        <MenuItem data-filter-action="cancel" @select="dismiss('programmatic', true)">
          {{ t("ribbon.cancelFilter") }}
        </MenuItem>
      </MenuSurface>
    </Teleport>
  </span>
</template>

<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;

.ribbon-menu-tool {
  @include ribbon.tool;
}

.filter-value-menu {
  z-index: var(--sheetcraft-layer-menu);
  min-width: 220px;
  max-height: min(360px, calc(100vh - 16px));
}
</style>
