<script setup lang="ts">
import { Check, ListFilter } from "lucide-vue-next";
import { computed, nextTick, ref, useId, watch } from "vue";
import { useDismissibleFloatingPanel } from "../../../shared/floating/useDismissibleFloatingPanel";
import { useAppI18n } from "../../../shared/i18n";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSeparator from "../../../shared/menu/MenuSeparator.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import {
  areFilterValueKeysEqual,
  type FilterValueKey,
  type FilterValueOption,
} from "./data-tool-state";
import RibbonIconAction from "./RibbonIconAction.vue";

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
const triggerComponentRef = ref<InstanceType<typeof RibbonIconAction> | null>(null);
const triggerRef = computed(() => triggerComponentRef.value?.rootElement ?? null);
const menuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const menuRef = computed<HTMLElement | null>(() => menuSurfaceRef.value?.rootElement ?? null);
const open = ref(false);
const draftKeys = ref<FilterValueKey[]>([]);
const menuId = `filter-values-menu-${useId().replaceAll(":", "")}`;
const allSelected = computed(
  () => props.options.length > 0 && props.options.every((option) => isDraftIncluded(option.key)),
);
const { floatingStyles, dismiss } = useDismissibleFloatingPanel(triggerRef, menuRef, open, {
  offset: 4,
  onDismiss: () => {
    open.value = false;
  },
});

function cloneKeys(keys: readonly FilterValueKey[]): FilterValueKey[] {
  return keys.map((key) => ({ ...key }));
}

function isDraftIncluded(key: FilterValueKey): boolean {
  return draftKeys.value.some((draft) => areFilterValueKeysEqual(draft, key));
}

function openMenu(focus: "first" | "last" = "first"): void {
  if (props.disabled) return;
  draftKeys.value = cloneKeys(props.appliedKeys);
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
    variant="tall"
    :label="t('ribbon.filter')"
    :text="t('ribbon.filter')"
    :disabled="disabled"
    :pressed="active"
    disclosure
    data-ribbon-action="filter"
    aria-haspopup="menu"
    :aria-expanded="open"
    :aria-controls="open ? menuId : undefined"
    @activate="toggleMenu"
    @keydown="onTriggerKeydown"
  >
    <ListFilter :size="17" aria-hidden="true" />
  </RibbonIconAction>

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
</template>

<style scoped lang="scss">
.filter-value-menu {
  position: fixed;
  z-index: 80;
  min-width: 220px;
  max-height: min(360px, calc(100vh - 16px));
}
</style>
