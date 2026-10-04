<script setup lang="ts">
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CalendarDays,
  ChevronRight,
  Copy,
  ListOrdered,
  TextCursorInput,
  Trophy,
  WandSparkles,
} from "lucide-vue-next";
import type { FillDirection } from "@idea10/sheet-engine/fill-selection";
import { computed, ref, useId } from "vue";
import { useAppI18n } from "../../../shared/i18n";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSeparator from "../../../shared/menu/MenuSeparator.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import { useMenu } from "../../../shared/menu/useMenu";
import { useSubmenu } from "../../../shared/menu/useSubmenu";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";
import { formatFillDateSample, type FillDateFormat } from "../fill-date-formats";

const props = defineProps<{ disabled: boolean; canFillRows: boolean; canFillColumns: boolean }>();
const emit = defineEmits<{
  fill: [direction: FillDirection];
  series: [];
  numberSequence: [];
  rank: [];
  flashFill: [];
  currentDate: [format: FillDateFormat];
  blanks: [];
  insertText: [position: "start" | "index" | "end"];
}>();
type FillSubmenu = "insert-text" | "current-date";

const { t } = useAppI18n();
const trigger = ref<InstanceType<typeof RibbonMenuButton> | null>(null);
const triggerRef = computed(() => trigger.value?.rootElement ?? null);
const surface = ref<InstanceType<typeof MenuSurface> | null>(null);
const submenuSurface = ref<InstanceType<typeof MenuSurface> | null>(null);
const menuRef = computed(() => surface.value?.rootElement ?? null);
const menuId = `data-fill-${useId().replaceAll(":", "")}`;
const submenuId = `data-fill-submenu-${useId().replaceAll(":", "")}`;
const unavailable = computed(() => props.disabled);
const menuDate = ref(new Date());
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef,
  menuSurfaceRef: surface,
  disabled: unavailable,
  additionalInside: () => [submenuRef.value],
  onOpen: () => {
    menuDate.value = new Date();
  },
});
const {
  activeSubmenu,
  submenuElement: submenuRef,
  submenuStyles,
  openSubmenu: openSharedSubmenu,
  onParentKeydown,
  onParentFocusin,
  onParentMouseover,
  onSubmenuKeydown: onSharedSubmenuKeydown,
} = useSubmenu<FillSubmenu>({
  parentOpen: open,
  submenuSurfaceRef: submenuSurface,
  getAnchor: (submenu) =>
    menuRef.value?.querySelector<HTMLElement>(`[data-data-fill="${submenu}"]`) ?? null,
  offset: 4,
  onOpen: (submenu) => {
    if (submenu === "current-date") menuDate.value = new Date();
  },
});

function choose(direction: FillDirection): void {
  if (unavailable.value) return;
  if (direction === "down" || direction === "up" ? !props.canFillRows : !props.canFillColumns)
    return;
  dismiss("programmatic", false);
  emit("fill", direction);
}
function closeAll(restoreFocus = true): void {
  dismiss("programmatic", restoreFocus);
}

function chooseTool(tool: "series" | "numberSequence" | "rank" | "blanks" | "flashFill"): void {
  if (unavailable.value) return;
  closeAll(false);
  switch (tool) {
    case "series":
      emit("series");
      break;
    case "numberSequence":
      emit("numberSequence");
      break;
    case "rank":
      emit("rank");
      break;
    case "blanks":
      emit("blanks");
      break;
    case "flashFill":
      emit("flashFill");
      break;
  }
}

function openSubmenu(submenu: FillSubmenu, focus = true): void {
  if (unavailable.value) return;
  openSharedSubmenu(submenu, focus);
}

function dateLabel(format: FillDateFormat): string {
  const date = menuDate.value;
  return formatFillDateSample(format, {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  });
}

function chooseInsertText(position: "start" | "index" | "end"): void {
  if (unavailable.value) return;
  closeAll(false);
  emit("insertText", position);
}

function chooseCurrentDate(format: FillDateFormat): void {
  if (unavailable.value) return;
  closeAll(false);
  emit("currentDate", format);
}

function onMenuKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    event.preventDefault();
    closeAll(true);
    return;
  }
  const submenu =
    event.target instanceof HTMLElement
      ? (event.target.closest<HTMLElement>("[data-data-fill]")?.dataset.dataFill as
          | FillSubmenu
          | undefined)
      : undefined;
  onParentKeydown(event, submenu);
}

function onMenuFocusin(event: FocusEvent): void {
  const submenu =
    event.target instanceof HTMLElement
      ? (event.target.closest<HTMLElement>("[data-data-fill]")?.dataset.dataFill as
          | FillSubmenu
          | undefined)
      : undefined;
  onParentFocusin(submenu);
}

function onMenuMouseover(event: MouseEvent): void {
  const submenu =
    event.target instanceof Element
      ? (event.target.closest<HTMLElement>("[data-data-fill]")?.dataset.dataFill as
          | FillSubmenu
          | undefined)
      : undefined;
  onParentMouseover(submenu);
}

function onSubmenuKeydown(event: KeyboardEvent): void {
  onSharedSubmenuKeydown(event);
}
</script>

<template>
  <div class="data-fill-tool">
    <RibbonMenuButton
      ref="trigger"
      variant="tall"
      :disabled="unavailable"
      :label="t('dataTools.fill.title')"
      :text="t('dataTools.fill.title')"
      data-data-action="fill"
      popup-role="menu"
      :expanded="open"
      :menu-id="menuId"
      @activate="toggleMenu"
      @keydown="onTriggerKeydown"
      ><Copy
    /></RibbonMenuButton>
    <Teleport to="body">
      <MenuSurface
        v-if="open"
        :id="menuId"
        ref="surface"
        class="data-fill-tool__menu"
        :style="floatingStyles"
        :label="t('dataTools.fill.title')"
        @focusin="onMenuFocusin"
        @keydown="onMenuKeydown"
        @mouseover="onMenuMouseover"
      >
        <MenuItem data-data-fill="down" :disabled="!canFillRows" @select="choose('down')">
          <template #icon><ArrowDown :size="15" /></template>
          {{ t("dataTools.fill.down") }}
          <template #shortcut>Ctrl+D</template>
        </MenuItem>
        <MenuItem data-data-fill="right" :disabled="!canFillColumns" @select="choose('right')">
          <template #icon><ArrowRight :size="15" /></template>
          {{ t("dataTools.fill.right") }}
          <template #shortcut>Ctrl+R</template>
        </MenuItem>
        <MenuItem data-data-fill="up" :disabled="!canFillRows" @select="choose('up')">
          <template #icon><ArrowUp :size="15" /></template>
          {{ t("dataTools.fill.up") }}
        </MenuItem>
        <MenuItem data-data-fill="left" :disabled="!canFillColumns" @select="choose('left')">
          <template #icon><ArrowLeft :size="15" /></template>
          {{ t("dataTools.fill.left") }}
        </MenuItem>
        <MenuSeparator />
        <MenuItem data-data-fill="number-sequence" @select="chooseTool('numberSequence')">
          <template #icon><ListOrdered :size="15" /></template>
          {{ t("dataTools.fill.numberSequence") }}
        </MenuItem>
        <MenuItem data-data-fill="rank" @select="chooseTool('rank')">
          <template #icon><Trophy :size="15" /></template>
          {{ t("dataTools.fill.rank") }}
        </MenuItem>
        <MenuItem data-data-fill="flash-fill" @select="chooseTool('flashFill')">
          <template #icon><WandSparkles :size="15" /></template>
          {{ t("dataTools.fill.flashFill") }}
          <template #shortcut>Ctrl+E</template>
        </MenuItem>
        <MenuSeparator />
        <MenuItem data-data-fill="blanks" @select="chooseTool('blanks')">
          <template #icon><Copy :size="15" /></template>
          {{ t("dataTools.fill.blanks") }}
        </MenuItem>
        <MenuItem
          data-data-fill="insert-text"
          aria-haspopup="menu"
          :aria-expanded="activeSubmenu === 'insert-text'"
          :aria-controls="activeSubmenu === 'insert-text' ? submenuId : undefined"
          @select="openSubmenu('insert-text')"
        >
          <template #icon><TextCursorInput :size="15" /></template>
          {{ t("dataTools.fill.insertText") }}
          <template #shortcut><ChevronRight :size="15" /></template>
        </MenuItem>
        <MenuItem
          data-data-fill="current-date"
          aria-haspopup="menu"
          :aria-expanded="activeSubmenu === 'current-date'"
          :aria-controls="activeSubmenu === 'current-date' ? submenuId : undefined"
          @select="openSubmenu('current-date')"
        >
          <template #icon><CalendarDays :size="15" /></template>
          {{ t("dataTools.fill.currentDate") }}
          <template #shortcut><ChevronRight :size="15" /></template>
        </MenuItem>
        <MenuSeparator />
        <MenuItem data-data-fill="series" @select="chooseTool('series')">
          <template #icon><ListOrdered :size="15" /></template>
          {{ t("dataTools.fill.series") }}
        </MenuItem>
      </MenuSurface>

      <MenuSurface
        v-if="activeSubmenu === 'insert-text'"
        :id="submenuId"
        ref="submenuSurface"
        class="data-fill-tool__submenu"
        :style="submenuStyles"
        :label="t('dataTools.fill.insertText')"
        @keydown="onSubmenuKeydown"
      >
        <MenuItem data-data-fill="insert-at-start" @select="chooseInsertText('start')">
          <template #icon><TextCursorInput :size="15" /></template>
          {{ t("dataTools.fill.insertAtStart") }}
        </MenuItem>
        <MenuItem data-data-fill="insert-at-index" @select="chooseInsertText('index')">
          <template #icon><TextCursorInput :size="15" /></template>
          {{ t("dataTools.fill.insertAtIndex") }}
        </MenuItem>
        <MenuItem data-data-fill="insert-at-end" @select="chooseInsertText('end')">
          <template #icon><TextCursorInput :size="15" /></template>
          {{ t("dataTools.fill.insertAtEnd") }}
        </MenuItem>
      </MenuSurface>

      <MenuSurface
        v-if="activeSubmenu === 'current-date'"
        :id="submenuId"
        ref="submenuSurface"
        class="data-fill-tool__submenu"
        :style="submenuStyles"
        :label="t('dataTools.fill.currentDate')"
        @keydown="onSubmenuKeydown"
      >
        <MenuItem data-data-fill="date-format-chinese" @select="chooseCurrentDate('yyyy年m月d日')">
          <template #icon><CalendarDays :size="15" /></template>
          {{ dateLabel("yyyy年m月d日") }}
        </MenuItem>
        <MenuItem data-data-fill="date-format-dash-short" @select="chooseCurrentDate('yyyy-m-d')">
          <template #icon><CalendarDays :size="15" /></template>
          {{ dateLabel("yyyy-m-d") }}
        </MenuItem>
        <MenuItem data-data-fill="date-format-dot-short" @select="chooseCurrentDate('yyyy.m.d')">
          <template #icon><CalendarDays :size="15" /></template>
          {{ dateLabel("yyyy.m.d") }}
        </MenuItem>
        <MenuItem data-data-fill="date-format-slash-short" @select="chooseCurrentDate('yyyy/m/d')">
          <template #icon><CalendarDays :size="15" /></template>
          {{ dateLabel("yyyy/m/d") }}
        </MenuItem>
        <MenuItem data-data-fill="date-format-compact" @select="chooseCurrentDate('yyyymmdd')">
          <template #icon><CalendarDays :size="15" /></template>
          {{ dateLabel("yyyymmdd") }}
        </MenuItem>
        <MenuItem
          data-data-fill="date-format-chinese-padded"
          @select="chooseCurrentDate('yyyy年mm月dd日')"
        >
          <template #icon><CalendarDays :size="15" /></template>
          {{ dateLabel("yyyy年mm月dd日") }}
        </MenuItem>
        <MenuItem data-data-fill="date-format-dash" @select="chooseCurrentDate('yyyy-mm-dd')">
          <template #icon><CalendarDays :size="15" /></template>
          {{ dateLabel("yyyy-mm-dd") }}
        </MenuItem>
        <MenuItem data-data-fill="date-format-dot" @select="chooseCurrentDate('yyyy.mm.dd')">
          <template #icon><CalendarDays :size="15" /></template>
          {{ dateLabel("yyyy.mm.dd") }}
        </MenuItem>
        <MenuItem data-data-fill="date-format-slash" @select="chooseCurrentDate('yyyy/mm/dd')">
          <template #icon><CalendarDays :size="15" /></template>
          {{ dateLabel("yyyy/mm/dd") }}
        </MenuItem>
      </MenuSurface>
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
.data-fill-tool {
  display: contents;

  &__menu {
  }

  &__submenu {
  }
}
</style>
