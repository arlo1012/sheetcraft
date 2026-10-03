<script setup lang="ts">
import { computed, nextTick, ref, useId } from "vue";
import {
  ArrowDownUp,
  BetweenHorizontalEnd,
  ChevronRight,
  CopyPlus,
  Equal,
  Eraser,
  Highlighter,
  BarChart3,
  Palette,
  Shapes,
  TableProperties,
  ArrowDown,
  ArrowUp,
  Percent,
  Trophy,
  CalendarDays,
  ListOrdered,
  Plus,
  TextCursorInput,
} from "lucide-vue-next";
import type { ConditionalFormatPresetKind } from "../conditional-format-presets";
import ConditionalFormatPresetGallery from "./ConditionalFormatPresetGallery.vue";
import { useFloatingPanel } from "../../../shared/floating/useFloatingPanel";
import { useAppI18n } from "../../../shared/i18n";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSeparator from "../../../shared/menu/MenuSeparator.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import { useMenu } from "../../../shared/menu/useMenu";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";

export type ConditionalFormatQuickRule =
  | ConditionalFormatPresetKind
  | "cellValue"
  | "greaterThan"
  | "lessThan"
  | "between"
  | "equal"
  | "contains"
  | "duplicate"
  | "formula"
  | "rank"
  | "average"
  | "date"
  | "dataBar"
  | "colorScale"
  | "iconSet"
  | "top10Items"
  | "top10Percent"
  | "bottom10Items"
  | "bottom10Percent"
  | "aboveAverage"
  | "belowAverage"
  | "yesterday"
  | "today"
  | "tomorrow"
  | "last7Days"
  | "lastWeek"
  | "thisWeek"
  | "nextWeek"
  | "lastMonth"
  | "thisMonth"
  | "nextMonth";
type Submenu = "highlight" | "topBottom" | "dataBars" | "colorScales" | "iconSets" | "clear" | null;
const props = withDefaults(defineProps<{ disabled?: boolean; editSessionId?: string }>(), {
  disabled: false,
  editSessionId: undefined,
});
const emit = defineEmits<{
  create: [kind: ConditionalFormatQuickRule];
  manage: [];
  clear: [scope: "selection" | "sheet"];
}>();
const { t } = useAppI18n();
const triggerRef = ref<InstanceType<typeof RibbonMenuButton> | null>(null);
const menuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const submenuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const triggerElement = computed(() => triggerRef.value?.rootElement ?? null);
const menuRef = computed(() => menuSurfaceRef.value?.rootElement ?? null);
const submenuRef = computed(() => submenuSurfaceRef.value?.rootElement ?? null);
const panelId = `conditional-formatting-menu-${useId().replaceAll(":", "")}`;
const submenuId = `conditional-formatting-submenu-${useId().replaceAll(":", "")}`;
const activeSubmenu = ref<Submenu>(null);
const disabled = computed(() => props.disabled);
const submenuTrigger = computed<HTMLElement | null>(() =>
  activeSubmenu.value
    ? (menuRef.value?.querySelector(`[data-conditional-format-action="${activeSubmenu.value}"]`) ??
      null)
    : null,
);
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef: triggerElement,
  menuSurfaceRef,
  disabled,
  placement: "bottom-start",
  additionalInside: () => [submenuRef.value],
  onDismiss: () => {
    activeSubmenu.value = null;
  },
});
const { floatingStyles: submenuStyles } = useFloatingPanel(
  submenuTrigger,
  submenuRef,
  computed(() => activeSubmenu.value !== null),
  { placement: "right-start", offset: 4 },
);
function openSubmenu(name: Exclude<Submenu, null>, focus = true): void {
  activeSubmenu.value = name;
  if (focus) void nextTick(() => submenuSurfaceRef.value?.focusFirstItem());
}
function openSubmenuOnHover(name: Exclude<Submenu, null>): void {
  if (open.value) activeSubmenu.value = name;
}
function closeSubmenu(): void {
  const trigger = submenuTrigger.value;
  activeSubmenu.value = null;
  void nextTick(() => trigger?.focus());
}
function create(kind: ConditionalFormatQuickRule): void {
  dismiss("programmatic", true);
  emit("create", kind);
}
function manage(): void {
  dismiss("programmatic", true);
  emit("manage");
}
function clear(scope: "selection" | "sheet"): void {
  dismiss("programmatic", true);
  emit("clear", scope);
}
function onMenuKeydown(event: KeyboardEvent): void {
  if (event.key !== "ArrowRight" || !(event.target instanceof HTMLElement)) return;
  const submenu = event.target.dataset.conditionalFormatAction as Submenu;
  if (submenu) {
    event.preventDefault();
    openSubmenu(submenu);
  }
}
function onSubmenuKeydown(event: KeyboardEvent): void {
  if (event.key !== "Escape" && event.key !== "ArrowLeft") return;
  event.preventDefault();
  event.stopPropagation();
  closeSubmenu();
}
</script>

<template>
  <div class="conditional-formatting-menu">
    <RibbonMenuButton
      ref="triggerRef"
      data-ribbon-action="conditional-formatting"
      :label="t('conditionalFormatting.toolbar')"
      :text="t('conditionalFormatting.toolbar')"
      :disabled="disabled"
      :expanded="open"
      :menu-id="panelId"
      variant="tall"
      @activate="toggleMenu"
      @keydown="onTriggerKeydown"
      ><TableProperties aria-hidden="true"
    /></RibbonMenuButton>
    <Teleport to="body">
      <MenuSurface
        v-if="open"
        :id="panelId"
        ref="menuSurfaceRef"
        class="conditional-formatting-menu__surface"
        :style="floatingStyles"
        :label="t('conditionalFormatting.toolbar')"
        :data-cell-edit-session="editSessionId"
        @keydown="onMenuKeydown"
      >
        <MenuItem
          data-conditional-format-action="highlight"
          aria-haspopup="menu"
          :aria-expanded="activeSubmenu === 'highlight'"
          :aria-controls="activeSubmenu === 'highlight' ? submenuId : undefined"
          @mouseenter="openSubmenuOnHover('highlight')"
          @select="openSubmenu('highlight')"
          ><template #icon><Highlighter /></template>{{ t("conditionalFormatting.highlightCells")
          }}<template #shortcut
            ><ChevronRight class="conditional-formatting-menu__chevron" /></template
        ></MenuItem>
        <MenuItem
          data-conditional-format-action="topBottom"
          aria-haspopup="menu"
          :aria-expanded="activeSubmenu === 'topBottom'"
          :aria-controls="activeSubmenu === 'topBottom' ? submenuId : undefined"
          @mouseenter="openSubmenuOnHover('topBottom')"
          @select="openSubmenu('topBottom')"
          ><template #icon><Trophy /></template>{{ t("conditionalFormatting.topBottomRules")
          }}<template #shortcut
            ><ChevronRight class="conditional-formatting-menu__chevron" /></template
        ></MenuItem>
        <MenuItem
          data-conditional-format-action="dataBars"
          aria-haspopup="menu"
          :aria-expanded="activeSubmenu === 'dataBars'"
          :aria-controls="activeSubmenu === 'dataBars' ? submenuId : undefined"
          @mouseenter="openSubmenuOnHover('dataBars')"
          @select="openSubmenu('dataBars')"
          ><template #icon><BarChart3 /></template>{{ t("conditionalFormatting.dataBars")
          }}<template #shortcut
            ><ChevronRight class="conditional-formatting-menu__chevron" /></template
        ></MenuItem>
        <MenuItem
          data-conditional-format-action="colorScales"
          aria-haspopup="menu"
          :aria-expanded="activeSubmenu === 'colorScales'"
          :aria-controls="activeSubmenu === 'colorScales' ? submenuId : undefined"
          @mouseenter="openSubmenuOnHover('colorScales')"
          @select="openSubmenu('colorScales')"
          ><template #icon><Palette /></template>{{ t("conditionalFormatting.colorScales")
          }}<template #shortcut
            ><ChevronRight class="conditional-formatting-menu__chevron" /></template
        ></MenuItem>
        <MenuItem
          data-conditional-format-action="iconSets"
          aria-haspopup="menu"
          :aria-expanded="activeSubmenu === 'iconSets'"
          :aria-controls="activeSubmenu === 'iconSets' ? submenuId : undefined"
          @mouseenter="openSubmenuOnHover('iconSets')"
          @select="openSubmenu('iconSets')"
          ><template #icon><Shapes /></template>{{ t("conditionalFormatting.iconSets")
          }}<template #shortcut
            ><ChevronRight class="conditional-formatting-menu__chevron" /></template
        ></MenuItem>
        <MenuSeparator />
        <MenuItem @select="create('colorScale')"
          ><template #icon><Plus /></template>{{ t("conditionalFormatting.newRule") }}</MenuItem
        >
        <MenuItem
          data-conditional-format-action="clear"
          aria-haspopup="menu"
          :aria-expanded="activeSubmenu === 'clear'"
          :aria-controls="activeSubmenu === 'clear' ? submenuId : undefined"
          @mouseenter="openSubmenuOnHover('clear')"
          @select="openSubmenu('clear')"
          ><template #icon><Eraser /></template>{{ t("conditionalFormatting.clearRules")
          }}<template #shortcut
            ><ChevronRight class="conditional-formatting-menu__chevron" /></template
        ></MenuItem>
        <MenuItem @select="manage"
          ><template #icon><ListOrdered /></template
          >{{ t("conditionalFormatting.manageRules") }}</MenuItem
        >
      </MenuSurface>
      <MenuSurface
        v-if="activeSubmenu"
        :id="submenuId"
        ref="submenuSurfaceRef"
        class="conditional-formatting-menu__submenu"
        :style="submenuStyles"
        :label="
          activeSubmenu === 'highlight'
            ? t('conditionalFormatting.highlightCells')
            : activeSubmenu === 'topBottom'
              ? t('conditionalFormatting.topBottomRules')
              : activeSubmenu === 'dataBars'
                ? t('conditionalFormatting.dataBars')
                : activeSubmenu === 'colorScales'
                  ? t('conditionalFormatting.colorScales')
                  : activeSubmenu === 'iconSets'
                    ? t('conditionalFormatting.iconSets')
                    : t('conditionalFormatting.clearRules')
        "
        @keydown="onSubmenuKeydown"
      >
        <template v-if="activeSubmenu === 'highlight'">
          <MenuItem @select="create('greaterThan')"
            ><template #icon><ArrowDownUp /></template
            >{{ t("conditionalFormatting.greaterThan") }}</MenuItem
          ><MenuItem @select="create('lessThan')"
            ><template #icon><ArrowDownUp /></template
            >{{ t("conditionalFormatting.lessThan") }}</MenuItem
          ><MenuItem @select="create('between')"
            ><template #icon><BetweenHorizontalEnd /></template
            >{{ t("conditionalFormatting.between") }}</MenuItem
          ><MenuItem @select="create('equal')"
            ><template #icon><Equal /></template>{{ t("conditionalFormatting.equal") }}</MenuItem
          ><MenuItem @select="create('contains')"
            ><template #icon><TextCursorInput /></template
            >{{ t("conditionalFormatting.contains") }}</MenuItem
          ><MenuItem @select="create('date')"
            ><template #icon><CalendarDays /></template
            >{{ t("conditionalFormatting.dateOccurring") }}</MenuItem
          ><MenuItem @select="create('duplicate')"
            ><template #icon><CopyPlus /></template
            >{{ t("conditionalFormatting.duplicate") }}</MenuItem
          >
          <MenuSeparator />
          <MenuItem @select="create('cellValue')">{{
            t("conditionalFormatting.moreRules")
          }}</MenuItem>
        </template>
        <template v-else-if="activeSubmenu === 'topBottom'">
          <MenuItem @select="create('top10Items')"
            ><template #icon><Trophy /></template
            >{{ t("conditionalFormatting.top10Items") }}</MenuItem
          >
          <MenuItem @select="create('top10Percent')"
            ><template #icon><Percent /></template
            >{{ t("conditionalFormatting.top10Percent") }}</MenuItem
          >
          <MenuItem @select="create('bottom10Items')"
            ><template #icon><ListOrdered /></template
            >{{ t("conditionalFormatting.bottom10Items") }}</MenuItem
          >
          <MenuItem @select="create('bottom10Percent')"
            ><template #icon><Percent /></template
            >{{ t("conditionalFormatting.bottom10Percent") }}</MenuItem
          >
          <MenuItem @select="create('aboveAverage')"
            ><template #icon><ArrowUp /></template
            >{{ t("conditionalFormatting.aboveAverage") }}</MenuItem
          >
          <MenuItem @select="create('belowAverage')"
            ><template #icon><ArrowDown /></template
            >{{ t("conditionalFormatting.belowAverage") }}</MenuItem
          >
          <MenuSeparator />
          <MenuItem @select="create('rank')">{{ t("conditionalFormatting.moreRules") }}</MenuItem>
        </template>
        <template
          v-else-if="
            activeSubmenu === 'dataBars' ||
            activeSubmenu === 'colorScales' ||
            activeSubmenu === 'iconSets'
          "
        >
          <ConditionalFormatPresetGallery :kind="activeSubmenu" @select="create" />
          <MenuSeparator />
          <MenuItem
            @select="
              create(
                activeSubmenu === 'dataBars'
                  ? 'dataBar'
                  : activeSubmenu === 'colorScales'
                    ? 'colorScale'
                    : 'iconSet',
              )
            "
            >{{ t("conditionalFormatting.moreRules") }}</MenuItem
          >
        </template>
        <template v-else
          ><MenuItem @select="clear('selection')">{{
            t("conditionalFormatting.clearSelection")
          }}</MenuItem
          ><MenuItem @select="clear('sheet')">{{
            t("conditionalFormatting.clearSheet")
          }}</MenuItem></template
        >
      </MenuSurface>
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
.conditional-formatting-menu {
  display: contents;
  &__surface,
  &__submenu {
    z-index: 50;
    width: max-content;
  }
  &__submenu {
    z-index: 51;
    max-height: calc(100vh - 32px);
    overflow-y: auto;
  }
  &__chevron {
    width: var(--idea-control-icon-size);
    height: var(--idea-control-icon-size);
  }
}
</style>
