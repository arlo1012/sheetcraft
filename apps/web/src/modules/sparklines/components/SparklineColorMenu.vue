<script setup lang="ts">
import { computed, ref, useId, watch } from "vue";
import { ChevronRight, PaintBucket, Palette } from "lucide-vue-next";
import type { SparklinePointKind } from "@sheetcraft/core/sparklines";
import type { SparklineToolContext, SparklineStylePatch } from "../useSparklineTools";
import { useAppI18n } from "../../../shared/i18n";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import { useMenu } from "../../../shared/menu/useMenu";
import { useSubmenu } from "../../../shared/menu/useSubmenu";
import FloatingPanelSurface from "../../../shared/floating/FloatingPanelSurface.vue";
import ColorPalette from "../../../shared/color/ColorPalette.vue";
const props = defineProps<{ context: SparklineToolContext; points?: boolean }>();
const emit = defineEmits<{ failed: [] }>();
const { t } = useAppI18n();
type PointField = SparklinePointKind | "negativeColor" | "markerColor";
const trigger = ref<InstanceType<typeof RibbonMenuButton>>();
const surface = ref<InstanceType<typeof MenuSurface> | null>(null);
const child = ref<InstanceType<typeof FloatingPanelSurface> | null>(null);
const menuId = `sparkline-color-${useId()}`;
const label = computed(() => t(props.points ? "sparkline.pointColors" : "sparkline.color"));
let owner: SparklineToolContext | undefined;
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef: computed(() => trigger.value?.rootElement ?? null),
  menuSurfaceRef: surface,
  disabled: computed(() => props.context.disabled),
  additionalInside: () => [child.value?.rootElement],
  onOpen: () => {
    owner = props.context;
  },
  onDismiss: () => {
    owner = undefined;
  },
});
watch(
  () => props.context,
  () => {
    if (open.value) dismiss("programmatic", false);
  },
  { flush: "sync" },
);
const { activeSubmenu, submenuStyles, openSubmenu, onParentKeydown, onSubmenuKeydown } =
  useSubmenu<PointField>({
    parentOpen: open,
    submenuSurfaceRef: child,
    getAnchor: (field) =>
      surface.value?.rootElement?.querySelector<HTMLElement>(`[data-point-field="${field}"]`) ??
      null,
    focus: (panel) =>
      panel.rootElement?.querySelector<HTMLElement>('button,[tabindex="0"]')?.focus(),
  });
function color(field: PointField): string {
  if (field === "negativeColor") return props.context.value.negativeColor;
  if (field === "markerColor") return props.context.value.markerColor ?? props.context.value.color;
  return props.context.value[field]?.color ?? "#ef4444";
}
function select(value: string | null, field?: PointField): void {
  if (!value || !open.value || owner !== props.context || props.context.disabled) return;
  const patch: SparklineStylePatch = !field
    ? { color: value }
    : field === "negativeColor" || field === "markerColor"
      ? { [field]: value }
      : { [field]: { color: value } };
  if (props.context.apply(patch)) dismiss("programmatic", true);
  else emit("failed");
}
</script>
<template>
  <span class="sparkline-color-menu">
    <RibbonMenuButton
      ref="trigger"
      :label="label"
      :text="label"
      :disabled="context.disabled"
      :expanded="open"
      :menu-id="menuId"
      @activate="toggleMenu"
      @keydown="onTriggerKeydown"
    >
      <Palette v-if="points" /><PaintBucket v-else />
    </RibbonMenuButton>
    <Teleport to="body">
      <MenuSurface
        v-if="open"
        :id="menuId"
        ref="surface"
        :label="label"
        :style="floatingStyles"
        class="sparkline-color-menu__surface"
      >
        <template v-if="points" #items>
          <MenuItem
            data-point-field="negativeColor"
            aria-haspopup="dialog"
            :aria-expanded="activeSubmenu === 'negativeColor'"
            @select="openSubmenu('negativeColor')"
            @mouseover="openSubmenu('negativeColor', false)"
            @keydown="onParentKeydown($event, 'negativeColor')"
            >{{ t("sparkline.negativePoints") }}<template #trailing><ChevronRight /></template
          ></MenuItem>
          <MenuItem
            data-point-field="markerColor"
            aria-haspopup="dialog"
            :aria-expanded="activeSubmenu === 'markerColor'"
            @select="openSubmenu('markerColor')"
            @mouseover="openSubmenu('markerColor', false)"
            @keydown="onParentKeydown($event, 'markerColor')"
            >{{ t("sparkline.markers") }}<template #trailing><ChevronRight /></template
          ></MenuItem>
          <MenuItem
            data-point-field="highPoint"
            aria-haspopup="dialog"
            :aria-expanded="activeSubmenu === 'highPoint'"
            @select="openSubmenu('highPoint')"
            @mouseover="openSubmenu('highPoint', false)"
            @keydown="onParentKeydown($event, 'highPoint')"
            >{{ t("sparkline.highPoint") }}<template #trailing><ChevronRight /></template
          ></MenuItem>
          <MenuItem
            data-point-field="lowPoint"
            aria-haspopup="dialog"
            :aria-expanded="activeSubmenu === 'lowPoint'"
            @select="openSubmenu('lowPoint')"
            @mouseover="openSubmenu('lowPoint', false)"
            @keydown="onParentKeydown($event, 'lowPoint')"
            >{{ t("sparkline.lowPoint") }}<template #trailing><ChevronRight /></template
          ></MenuItem>
          <MenuItem
            data-point-field="firstPoint"
            aria-haspopup="dialog"
            :aria-expanded="activeSubmenu === 'firstPoint'"
            @select="openSubmenu('firstPoint')"
            @mouseover="openSubmenu('firstPoint', false)"
            @keydown="onParentKeydown($event, 'firstPoint')"
            >{{ t("sparkline.firstPoint") }}<template #trailing><ChevronRight /></template
          ></MenuItem>
          <MenuItem
            data-point-field="lastPoint"
            aria-haspopup="dialog"
            :aria-expanded="activeSubmenu === 'lastPoint'"
            @select="openSubmenu('lastPoint')"
            @mouseover="openSubmenu('lastPoint', false)"
            @keydown="onParentKeydown($event, 'lastPoint')"
            >{{ t("sparkline.lastPoint") }}<template #trailing><ChevronRight /></template
          ></MenuItem>
        </template>
        <template v-else #body
          ><ColorPalette
            :model-value="context.value.color"
            :mixed="context.mixed.includes('color')"
            :show-default="false"
            @select="select($event)"
        /></template>
      </MenuSurface>
      <FloatingPanelSurface
        v-if="open && activeSubmenu"
        ref="child"
        :label="t('sparkline.pointColors')"
        :style="submenuStyles"
        layer="submenu"
        @keydown="onSubmenuKeydown($event, false)"
      >
        <ColorPalette
          :key="activeSubmenu"
          :model-value="color(activeSubmenu)"
          :mixed="context.mixed.includes(activeSubmenu)"
          :show-default="false"
          @select="select($event, activeSubmenu!)"
        />
      </FloatingPanelSurface>
    </Teleport>
  </span>
</template>
<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;
.sparkline-color-menu {
  @include ribbon.tool;
}
.sparkline-color-menu__surface {
  z-index: var(--sheetcraft-layer-menu);
}
</style>
