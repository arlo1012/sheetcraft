<script setup lang="ts">
import { computed, ref, useId } from "vue";
import {
  AlignStartVertical,
  Group,
  Ungroup,
  BringToFront,
  SendToBack,
  List,
  Layers,
} from "lucide-vue-next";
import { useAppI18n } from "../../../shared/i18n";
import RibbonButton from "../../../shared/ribbon/RibbonButton.vue";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuRadioItem from "../../../shared/menu/MenuRadioItem.vue";
import { useMenu } from "../../../shared/menu/useMenu";
import type {
  PictureAlignment,
  PictureAlignmentReference,
  PictureLayerAction,
} from "../usePictureTools";
const props = defineProps<{
  disabled: boolean;
  compact?: boolean;
  groupCreateDisabled?: boolean;
  count: number;
  grouped: boolean;
  groupDisabled?: boolean;
  alignmentDisabled?: boolean;
  gridDisabled?: boolean;
  alignmentReference?: PictureAlignmentReference;
}>();
const emit = defineEmits<{
  group: [];
  ungroup: [];
  align: [action: PictureAlignment, reference: PictureAlignmentReference];
  reference: [reference: PictureAlignmentReference];
  layer: [action: PictureLayerAction];
  selectionPane: [];
}>();
const { t } = useAppI18n();
const localReference = ref<PictureAlignmentReference>("selection");
const reference = computed(() => props.alignmentReference ?? localReference.value);
const buttonRef = ref<InstanceType<typeof RibbonMenuButton> | null>(null);
const triggerRef = computed(() => buttonRef.value?.rootElement ?? null);
const menuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const menuId = `picture-align-${useId()}`;
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef,
  menuSurfaceRef,
  disabled: computed(() => props.disabled || !!props.alignmentDisabled),
});
const layerButtonRef = ref<InstanceType<typeof RibbonMenuButton> | null>(null);
const layerSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const layerMenuId = `picture-layer-${useId()}`;
const {
  open: layerOpen,
  floatingStyles: layerStyles,
  dismiss: dismissLayer,
  toggleMenu: toggleLayer,
  onTriggerKeydown: layerKeydown,
} = useMenu({
  triggerRef: computed(() => layerButtonRef.value?.rootElement ?? null),
  menuSurfaceRef: layerSurfaceRef,
});
function layer(action: PictureLayerAction): void {
  if (props.disabled) return;
  emit("layer", action);
  dismissLayer("programmatic", true);
}
function ungroup(): void {
  if (props.disabled || props.groupDisabled || !props.grouped) return;
  emit("ungroup");
  dismissLayer("programmatic", true);
}
function selectionPane(): void {
  emit("selectionPane");
  dismissLayer("programmatic", true);
}
function align(action: PictureAlignment): void {
  if (props.disabled || props.alignmentDisabled) return;
  emit("align", action, reference.value);
  dismiss("programmatic", true);
}
function chooseReference(next: PictureAlignmentReference): void {
  if (props.disabled || props.alignmentDisabled) return;
  localReference.value = next;
  emit("reference", next);
  dismiss("programmatic", true);
}
</script>
<template>
  <section class="picture-arrange" role="group" :aria-label="t('picture.arrange')">
    <div v-if="!compact" class="picture-arrange__stack">
      <RibbonButton
        :label="t('picture.group')"
        :text="t('picture.group')"
        :disabled="disabled || groupDisabled || groupCreateDisabled || count < 2"
        @activate="
          !disabled && !groupDisabled && !groupCreateDisabled && count >= 2 && emit('group')
        "
        ><Group
      /></RibbonButton>
      <RibbonButton
        :label="t('picture.ungroup')"
        :text="t('picture.ungroup')"
        :disabled="disabled || groupDisabled || !grouped"
        @activate="emit('ungroup')"
        ><Ungroup
      /></RibbonButton>
    </div>
    <div :class="{ 'picture-arrange__stack': compact }">
      <RibbonButton
        v-if="compact"
        :label="t('picture.group')"
        :text="t('picture.group')"
        :disabled="disabled || groupDisabled || groupCreateDisabled || count < 2"
        @activate="
          !disabled && !groupDisabled && !groupCreateDisabled && count >= 2 && emit('group')
        "
        ><Group
      /></RibbonButton>
      <RibbonMenuButton
        ref="buttonRef"
        :variant="compact ? undefined : 'tall'"
        :label="t('picture.align')"
        :text="t('picture.align')"
        :disabled="disabled || alignmentDisabled"
        :expanded="open"
        :menu-id="menuId"
        @activate="toggleMenu"
        @keydown="onTriggerKeydown"
        ><AlignStartVertical
      /></RibbonMenuButton>
    </div>
    <div v-if="!compact" class="picture-arrange__stack">
      <RibbonButton
        :label="t('picture.forward')"
        :text="t('picture.forward')"
        :disabled="disabled"
        @activate="emit('layer', 'forward')"
        ><BringToFront
      /></RibbonButton>
      <RibbonButton
        :label="t('picture.backward')"
        :text="t('picture.backward')"
        :disabled="disabled"
        @activate="emit('layer', 'backward')"
        ><SendToBack
      /></RibbonButton>
    </div>
    <div v-if="!compact" class="picture-arrange__stack">
      <RibbonButton
        :label="t('picture.front')"
        :text="t('picture.front')"
        :disabled="disabled"
        @activate="emit('layer', 'front')"
        ><BringToFront
      /></RibbonButton>
      <RibbonButton
        :label="t('picture.back')"
        :text="t('picture.back')"
        :disabled="disabled"
        @activate="emit('layer', 'back')"
        ><SendToBack
      /></RibbonButton>
    </div>
    <RibbonButton
      v-if="!compact"
      variant="tall"
      :label="t('picture.selectionPane')"
      :text="t('picture.selectionPane')"
      @activate="emit('selectionPane')"
      ><List
    /></RibbonButton>
    <RibbonMenuButton
      v-if="compact"
      ref="layerButtonRef"
      variant="tall"
      :label="t('picture.layers')"
      :text="t('picture.layers')"
      :expanded="layerOpen"
      :menu-id="layerMenuId"
      @activate="toggleLayer"
      @keydown="layerKeydown"
      ><Layers
    /></RibbonMenuButton>
    <Teleport to="body">
      <MenuSurface
        v-if="open"
        :id="menuId"
        ref="menuSurfaceRef"
        :style="floatingStyles"
        class="picture-arrange__menu"
        :label="t('picture.align')"
      >
        <MenuRadioItem
          :checked="reference === 'selection'"
          @select="chooseReference('selection')"
          >{{ t("picture.alignToSelection") }}</MenuRadioItem
        >
        <MenuRadioItem
          :checked="reference === 'last-selected'"
          @select="chooseReference('last-selected')"
          >{{ t("picture.alignToLastSelected") }}</MenuRadioItem
        >
        <MenuItem :disabled="count < 2" @select="align('left')">{{
          t("picture.alignLeft")
        }}</MenuItem>
        <MenuItem :disabled="count < 2" @select="align('center')">{{
          t("picture.alignCenter")
        }}</MenuItem>
        <MenuItem :disabled="count < 2" @select="align('right')">{{
          t("picture.alignRight")
        }}</MenuItem>
        <MenuItem :disabled="count < 2" @select="align('top')">{{
          t("picture.alignTop")
        }}</MenuItem>
        <MenuItem :disabled="count < 2" @select="align('middle')">{{
          t("picture.alignMiddle")
        }}</MenuItem>
        <MenuItem :disabled="count < 2" @select="align('bottom')">{{
          t("picture.alignBottom")
        }}</MenuItem>
        <MenuItem :disabled="count < 3" @select="align('horizontal')">{{
          t("picture.distributeHorizontal")
        }}</MenuItem>
        <MenuItem :disabled="count < 3" @select="align('vertical')">{{
          t("picture.distributeVertical")
        }}</MenuItem>
        <MenuItem :disabled="gridDisabled" @select="align('grid')">{{
          t("picture.snapGrid")
        }}</MenuItem>
        <MenuItem :disabled="count < 2" @select="align('equal-height')">{{
          t("picture.equalHeight")
        }}</MenuItem>
        <MenuItem :disabled="count < 2" @select="align('equal-width')">{{
          t("picture.equalWidth")
        }}</MenuItem>
        <MenuItem :disabled="count < 2" @select="align('equal-size')">{{
          t("picture.equalSize")
        }}</MenuItem>
      </MenuSurface>
      <MenuSurface
        v-if="layerOpen"
        :id="layerMenuId"
        ref="layerSurfaceRef"
        :style="layerStyles"
        class="picture-arrange__menu"
        :label="t('picture.layers')"
      >
        <MenuItem :disabled="disabled" @select="layer('forward')"
          ><template #icon><BringToFront /></template>{{ t("picture.forward") }}</MenuItem
        >
        <MenuItem :disabled="disabled" @select="layer('backward')"
          ><template #icon><SendToBack /></template>{{ t("picture.backward") }}</MenuItem
        >
        <MenuItem :disabled="disabled" @select="layer('front')">{{ t("picture.front") }}</MenuItem>
        <MenuItem :disabled="disabled" @select="layer('back')">{{ t("picture.back") }}</MenuItem>
        <MenuItem :disabled="disabled || groupDisabled || !grouped" @select="ungroup"
          ><template #icon><Ungroup /></template>{{ t("picture.ungroup") }}</MenuItem
        >
        <MenuItem @select="selectionPane"
          ><template #icon><List /></template>{{ t("picture.selectionPane") }}</MenuItem
        >
      </MenuSurface>
    </Teleport>
  </section>
</template>
<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;
.picture-arrange {
  @include ribbon.columns;
  &__stack {
    @include ribbon.stack;
  }
  &__menu {
    z-index: var(--sheetcraft-layer-menu);
  }
}
</style>
