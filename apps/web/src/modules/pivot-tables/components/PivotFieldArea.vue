<script setup lang="ts">
import { computed, ref, useId } from "vue";
import { Plus, ChevronDown, GripVertical, Filter, Columns3, Rows3, Sigma } from "lucide-vue-next";
import { useAppI18n } from "../../../shared/i18n";
import { useMenu } from "../../../shared/menu/useMenu";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSearch from "../../../shared/menu/MenuSearch.vue";
import type { PivotArea, PivotFieldChoice, PivotFieldDrag } from "../pivot-field-edits";
const props = defineProps<{
  area: PivotArea;
  items: Array<{ field: number; label: string }>;
  choices: PivotFieldChoice[];
  disabled: boolean;
  dragging: boolean;
}>();
const emit = defineEmits<{
  add: [field: number];
  remove: [index: number];
  move: [index: number, area: PivotArea, at: number];
  settings: [index: number];
  dragStart: [drag: PivotFieldDrag];
  dragEnd: [];
  dropField: [index: number];
}>();
const { t } = useAppI18n();
const triggerRef = ref<HTMLElement | null>(null);
const menuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const menuId = `pivot-field-${useId()}`;
const { open, floatingStyles, dismiss, openMenu } = useMenu({
  triggerRef,
  menuSurfaceRef,
  disabled: computed(() => props.disabled),
});
const selectedIndex = ref<number | null>(null);
const search = ref("");
const dropIndex = ref<number | null>(null);
const choices = computed(() =>
  props.choices.filter((choice) =>
    choice.label.toLocaleLowerCase().includes(search.value.toLocaleLowerCase()),
  ),
);
function menu(event: MouseEvent, index: number | null): void {
  if (props.disabled) return;
  selectedIndex.value = index;
  search.value = "";
  triggerRef.value = event.currentTarget as HTMLElement;
  openMenu();
}
function add(field: number): void {
  dismiss("programmatic", true);
  emit("add", field);
}
function settings(): void {
  const index = selectedIndex.value;
  dismiss("programmatic", true);
  if (index !== null) emit("settings", index);
}
function move(area: PivotArea, at = 999): void {
  const index = selectedIndex.value;
  dismiss("programmatic", true);
  if (index !== null) emit("move", index, area, at);
}
function remove(): void {
  const index = selectedIndex.value;
  dismiss("programmatic", true);
  if (index !== null) emit("remove", index);
}
function start(event: DragEvent, index: number): void {
  if (props.disabled) {
    event.preventDefault();
    return;
  }
  event.dataTransfer?.setData("text/plain", props.items[index]!.label);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  emit("dragStart", { field: props.items[index]!.field, area: props.area, index });
}
function over(event: DragEvent, index: number): void {
  if (props.disabled || !props.dragging) return;
  event.preventDefault();
  event.stopPropagation();
  dropIndex.value = index;
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
}
function drop(event: DragEvent, index: number): void {
  if (props.disabled || !props.dragging) return;
  event.preventDefault();
  event.stopPropagation();
  dropIndex.value = null;
  emit("dropField", index);
}
</script>
<template>
  <section class="pivot-area" :data-pivot-area="area" :aria-label="t(`pivot.${area}`)">
    <header class="pivot-area__header">
      <Filter v-if="area === 'filters'" :size="14" /><Columns3
        v-else-if="area === 'columns'"
        :size="14"
      />
      <Rows3 v-else-if="area === 'rows'" :size="14" /><Sigma v-else :size="14" />
      <span>{{ t(`pivot.${area}`) }}</span>
      <button
        type="button"
        :disabled="disabled"
        :aria-label="t('pivot.addToArea', { area: t(`pivot.${area}`) })"
        @click="menu($event, null)"
      >
        <Plus :size="16" />
      </button>
    </header>
    <ul
      class="pivot-area__items"
      :class="{ 'is-drop-target': dragging && dropIndex !== null }"
      @dragover="over($event, items.length)"
      @drop="drop($event, items.length)"
      @dragleave.self="dropIndex = null"
    >
      <li
        v-for="(item, index) in items"
        :key="`${item.field}-${index}`"
        :draggable="!disabled"
        :class="{ 'is-drop-before': dragging && dropIndex === index }"
        :data-pivot-field="item.field"
        @dragstart="start($event, index)"
        @dragend="emit('dragEnd')"
        @dragover="over($event, index)"
        @drop="drop($event, index)"
      >
        <GripVertical :size="13" aria-hidden="true" />
        <button
          class="pivot-area__label"
          type="button"
          :disabled="disabled"
          :title="item.label"
          @click="emit('settings', index)"
        >
          {{ item.label }}
        </button>
        <button
          type="button"
          :disabled="disabled"
          :aria-label="t('pivot.fieldMenu', { field: item.label })"
          @click="menu($event, index)"
        >
          <ChevronDown :size="14" />
        </button>
      </li>
      <li v-if="!items.length" class="pivot-area__empty">{{ t("pivot.dropHere") }}</li>
    </ul>
    <Teleport to="body">
      <MenuSurface
        v-if="open"
        :id="menuId"
        ref="menuSurfaceRef"
        :style="floatingStyles"
        class="pivot-area__menu"
        :label="t(`pivot.${area}`)"
      >
        <template v-if="selectedIndex === null" #body
          ><MenuSearch v-model="search" :label="t('pivot.searchFields')"
        /></template>
        <template #items>
          <template v-if="selectedIndex === null"
            ><MenuItem v-for="choice in choices" :key="choice.field" @select="add(choice.field)">{{
              choice.label
            }}</MenuItem></template
          >
          <template v-else>
            <MenuItem @select="settings">{{ t("pivot.fieldSettings") }}</MenuItem>
            <MenuItem :disabled="selectedIndex === 0" @select="move(area, selectedIndex - 1)">{{
              t("pivot.moveUp")
            }}</MenuItem>
            <MenuItem
              :disabled="selectedIndex >= items.length - 1"
              @select="move(area, selectedIndex + 2)"
              >{{ t("pivot.moveDown") }}</MenuItem
            >
            <MenuItem v-if="area !== 'filters'" @select="move('filters')">{{
              t("pivot.moveToFilters")
            }}</MenuItem>
            <MenuItem v-if="area !== 'columns'" @select="move('columns')">{{
              t("pivot.moveToColumns")
            }}</MenuItem>
            <MenuItem v-if="area !== 'rows'" @select="move('rows')">{{
              t("pivot.moveToRows")
            }}</MenuItem>
            <MenuItem v-if="area !== 'values'" @select="move('values')">{{
              t("pivot.moveToValues")
            }}</MenuItem>
            <MenuItem @select="remove">{{ t("pivot.remove") }}</MenuItem>
          </template>
        </template>
      </MenuSurface>
    </Teleport>
  </section>
</template>
<style scoped lang="scss">
.pivot-area {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 100px;
  &__header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 0;
    span {
      flex: 1;
    }
  }
  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: 0;
    color: inherit;
    padding: 3px;
    cursor: pointer;
    &:hover:not(:disabled) {
      background: var(--idea-action-hover);
    }
    &:disabled {
      cursor: default;
      opacity: 0.5;
    }
    &:focus-visible {
      outline: 2px solid var(--idea-action-primary);
      outline-offset: -2px;
    }
  }
  &__items {
    list-style: none;
    margin: 0;
    padding: 5px;
    flex: 1;
    min-height: 70px;
    max-height: 200px;
    overflow: auto;
    background: var(--idea-surface-panel);
    border: 1px solid var(--idea-border-control);
    border-radius: 4px;
    &.is-drop-target {
      border-color: var(--idea-action-primary);
    }
    li {
      display: flex;
      align-items: center;
      gap: 3px;
      min-height: 28px;
      margin-bottom: 4px;
      border: 1px solid var(--idea-border-subtle);
      background: var(--idea-surface-secondary);
      border-radius: 3px;
    }
    li.is-drop-before {
      border-top: 2px solid var(--idea-action-primary);
    }
    li.pivot-area__empty {
      border: 0;
      background: transparent;
      font-size: 12px;
      color: var(--idea-text-secondary);
    }
  }
  &__label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    text-align: left;
    justify-content: flex-start;
  }
  &__menu {
    z-index: var(--idea-layer-menu);
    min-width: 180px;
    max-height: 380px;
    overflow: auto;
  }
}
</style>
