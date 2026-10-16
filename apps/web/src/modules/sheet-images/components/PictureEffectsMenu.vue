<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId, watch } from "vue";
import { Sparkles, ChevronRight } from "lucide-vue-next";
import type { ImageAppearance } from "@sheetcraft/core/workbook";
import { useAppI18n } from "../../../shared/i18n";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import { useMenu } from "../../../shared/menu/useMenu";
import { useSubmenu } from "../../../shared/menu/useSubmenu";
import PicturePresetChoices from "./format-pane/PicturePresetChoices.vue";
import {
  getPictureEffectPresetGroups,
  getPictureEffectPreset,
  findPictureEffectPresetId,
  type PicturePresetCategory,
} from "../picture-effect-presets";
import { getPictureOwnDetailedStyle } from "../picture-detailed-style-edit";
import { normalizePictureEffectEdit, type PictureEffectEdit } from "../picture-effect-edit";
import type { PictureFormatLabelKey } from "../picture-format-pane-model";
const props = defineProps<{
  source: object;
  appearance?: ImageAppearance;
  disabled: boolean;
  formatDisabled?: boolean;
  effectHandler?: (edit: PictureEffectEdit) => boolean;
  restoreEffectsFocusTarget?: () => HTMLElement | null;
}>();
const emit = defineEmits<{ format: [] }>();
const { t } = useAppI18n();
const label = (key: PictureFormatLabelKey) => t(`pictureFormat.${key}`);
const button = ref<InstanceType<typeof RibbonMenuButton>>();
defineExpose({
  getEffectsTrigger: (): HTMLElement | null =>
    props.disabled ? null : (button.value?.rootElement ?? null),
});
let focusReturn: (() => HTMLElement | null) | undefined;
const surface = ref<InstanceType<typeof MenuSurface> | null>(null);
const submenu = ref<InstanceType<typeof MenuSurface> | null>(null);
const choices = ref<InstanceType<typeof PicturePresetChoices>>();
const menuId = `picture-effects-${useId()}`;
const generation = ref(0);
let live = true;
const rejected = ref(false);
const applying = ref(false);
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef: computed(() => button.value?.rootElement ?? null),
  menuSurfaceRef: surface,
  disabled: computed(() => props.disabled),
  additionalInside: () => [submenu.value?.rootElement],
  restoreFocusTarget: () => focusReturn?.(),
  onOpen: () => {
    focusReturn = props.restoreEffectsFocusTarget;
    generation.value++;
    rejected.value = false;
  },
  onDismiss: () => {
    generation.value++;
  },
});
const {
  activeSubmenu,
  submenuStyles,
  openSubmenu,
  onParentKeydown,
  onParentFocusin,
  onParentMouseover,
  onSubmenuKeydown,
} = useSubmenu<PicturePresetCategory>({
  parentOpen: open,
  submenuSurfaceRef: submenu,
  getAnchor: (name) =>
    surface.value?.rootElement?.querySelector(`[data-effect-category="${name}"]`) ?? null,
  focus: () => choices.value?.focusFirstItem(),
  onOpen: () => {
    focusReturn = props.restoreEffectsFocusTarget;
    generation.value++;
    rejected.value = false;
  },
});
function category(event: Event): PicturePresetCategory | undefined {
  return (event.target as HTMLElement)?.closest<HTMLElement>("[data-effect-category]")?.dataset
    .effectCategory as PicturePresetCategory | undefined;
}
const groups = computed(() =>
  activeSubmenu.value ? getPictureEffectPresetGroups(activeSubmenu.value) : [],
);
const selected = computed(() => {
  const name = activeSubmenu.value;
  return name
    ? findPictureEffectPresetId(name, getPictureOwnDetailedStyle(props.appearance)?.[name])
    : undefined;
});
const selectPreset = computed(() => {
  const source = props.source,
    handler = props.effectHandler,
    name = activeSubmenu.value,
    token = generation.value;
  return (id: string): boolean => {
    if (
      !live ||
      !open.value ||
      props.disabled ||
      applying.value ||
      token !== generation.value ||
      source !== props.source ||
      handler !== props.effectHandler ||
      !handler ||
      !name ||
      name !== activeSubmenu.value
    )
      return false;
    const preset = getPictureEffectPreset(name, id);
    if (!preset) return false;
    applying.value = true;
    try {
      const edit = normalizePictureEffectEdit({
        category: name,
        value: preset,
      } as PictureEffectEdit);
      if (!edit || !handler(edit)) {
        rejected.value = true;
        return false;
      }
      dismiss("programmatic", true);
      return true;
    } catch {
      rejected.value = true;
      return false;
    } finally {
      applying.value = false;
    }
  };
});
const moreOptions = computed(() => {
  const source = props.source,
    token = generation.value;
  return () => {
    if (
      !live ||
      !open.value ||
      props.disabled ||
      props.formatDisabled ||
      source !== props.source ||
      token !== generation.value
    )
      return;
    dismiss("programmatic", true);
    emit("format");
  };
});
watch(
  () => [props.source, props.effectHandler, props.disabled],
  () => {
    generation.value++;
    dismiss("programmatic", false);
  },
  { flush: "sync" },
);
onBeforeUnmount(() => {
  live = false;
  generation.value++;
});
</script>
<template>
  <RibbonMenuButton
    ref="button"
    variant="tall"
    :label="t('picture.effects')"
    :text="t('picture.effects')"
    :disabled="disabled"
    :expanded="open"
    :menu-id="menuId"
    @activate="toggleMenu"
    @keydown="onTriggerKeydown"
    ><Sparkles
  /></RibbonMenuButton>
  <Teleport to="body">
    <MenuSurface
      v-if="open"
      :id="menuId"
      ref="surface"
      :label="t('picture.effects')"
      :style="floatingStyles"
      @keydown="onParentKeydown($event, category($event))"
      @focusin="onParentFocusin(category($event))"
      @mouseover="onParentMouseover(category($event))"
    >
      <template #items>
        <MenuItem
          data-effect-category="shadow"
          aria-haspopup="menu"
          :aria-expanded="activeSubmenu === 'shadow'"
          @select="openSubmenu('shadow')"
        >
          {{ label("shadowSection") }}<template #shortcut><ChevronRight :size="14" /></template>
        </MenuItem>
        <MenuItem
          data-effect-category="reflection"
          aria-haspopup="menu"
          :aria-expanded="activeSubmenu === 'reflection'"
          @select="openSubmenu('reflection')"
        >
          {{ label("reflectionSection") }}<template #shortcut><ChevronRight :size="14" /></template>
        </MenuItem>
        <MenuItem
          data-effect-category="glow"
          aria-haspopup="menu"
          :aria-expanded="activeSubmenu === 'glow'"
          @select="openSubmenu('glow')"
        >
          {{ label("glowSection") }}<template #shortcut><ChevronRight :size="14" /></template>
        </MenuItem>
        <MenuItem
          data-effect-category="softEdges"
          aria-haspopup="menu"
          :aria-expanded="activeSubmenu === 'softEdges'"
          @select="openSubmenu('softEdges')"
        >
          {{ label("softEdgesSection") }}<template #shortcut><ChevronRight :size="14" /></template>
        </MenuItem>
        <MenuItem
          data-effect-category="rotation3d"
          aria-haspopup="menu"
          :aria-expanded="activeSubmenu === 'rotation3d'"
          @select="openSubmenu('rotation3d')"
        >
          {{ label("rotation3dSection") }}<template #shortcut><ChevronRight :size="14" /></template>
        </MenuItem>
      </template>
      <template v-if="formatDisabled" #header
        ><p :id="`${menuId}-format-reason`" class="picture-effects-menu__reason">
          {{ label("singlePictureEffects") }}
        </p></template
      >
      <template #footer
        ><MenuItem
          :disabled="disabled || formatDisabled"
          :aria-describedby="formatDisabled ? `${menuId}-format-reason` : undefined"
          @select="moreOptions"
          >{{ t("ribbon.moreOptions", { tool: t("picture.effects") }) }}</MenuItem
        ></template
      >
    </MenuSurface>
    <MenuSurface
      v-if="open && activeSubmenu"
      ref="submenu"
      :label="label(`${activeSubmenu}Section`)"
      :body-scrollable="false"
      :style="submenuStyles"
      @keydown="onSubmenuKeydown($event, !$event.defaultPrevented)"
    >
      <template #body>
        <PicturePresetChoices
          ref="choices"
          :owner-key="menuId + ':' + activeSubmenu"
          :groups="groups"
          :selected-id="selected"
          :columns="
            activeSubmenu === 'glow'
              ? 6
              : activeSubmenu === 'rotation3d'
                ? 4
                : activeSubmenu === 'softEdges'
                  ? 1
                  : 3
          "
          :show-labels="activeSubmenu === 'softEdges'"
          :disabled="disabled || applying || !effectHandler"
          :t="label"
          :on-select="selectPreset"
        />
        <p v-if="rejected" class="picture-effects-menu__error" role="alert">
          {{ label("applyRejected") }}
        </p>
      </template>
    </MenuSurface>
  </Teleport>
</template>
<style scoped lang="scss">
.picture-effects-menu__reason {
  width: 230px;
  margin: 8px;
  color: var(--sheetcraft-text-secondary);
  font-size: 12px;
}
.picture-effects-menu__error {
  max-width: 280px;
  margin: 8px;
  color: var(--sheetcraft-status-error);
  font-size: 12px;
}
</style>
