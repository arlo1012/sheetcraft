<script setup lang="ts">
import { computed, ref, useId, watch } from "vue";
import { Axis3D, Check, Minus } from "lucide-vue-next";
import type { SparklineAxisEnd } from "../useSparklineAxisLimit";
import type { SparklineToolContext } from "../useSparklineTools";
import { useAppI18n } from "../../../shared/i18n";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuRadioItem from "../../../shared/menu/MenuRadioItem.vue";
import MenuSeparator from "../../../shared/menu/MenuSeparator.vue";
import { useMenu } from "../../../shared/menu/useMenu";
import SparklineAxisSection from "./SparklineAxisSection.vue";
const props = defineProps<{ context: SparklineToolContext }>();
const emit = defineEmits<{ custom: [end: SparklineAxisEnd]; failed: [] }>();
const { t } = useAppI18n();
const ends = ["minAxis", "maxAxis"] as const;
const button = ref<InstanceType<typeof RibbonMenuButton>>();
const surface = ref<InstanceType<typeof MenuSurface>>();
const menuId = `sparkline-axis-${useId()}`;
let owner: SparklineToolContext | undefined;
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef: computed(() => button.value?.rootElement ?? null),
  menuSurfaceRef: computed(() => surface.value ?? null),
  disabled: computed(() => props.context.disabled),
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
function takeOwner(restoreFocus: boolean) {
  if (!open.value || !owner || owner !== props.context || owner.disabled) return;
  const current = owner;
  dismiss("programmatic", restoreFocus);
  return current;
}
function checked(key: "axis" | "rightToLeft") {
  return props.context.mixed.includes(key) ? "mixed" : !!props.context.value[key];
}
function toggle(key: "axis" | "rightToLeft") {
  const value = checked(key) !== true;
  const current = takeOwner(true);
  if (current && !current.apply({ [key]: value })) emit("failed");
}
function mode(end: SparklineAxisEnd) {
  return props.context.mixedAxisModes.includes(end)
    ? undefined
    : (props.context.value[end]?.type ?? "individual");
}
function limit(end: SparklineAxisEnd, type: "individual" | "group" | "custom") {
  const current = takeOwner(type !== "custom");
  if (!current) return;
  if (type === "custom") emit("custom", end);
  else if (mode(end) !== type && !current.apply({ [end]: { type } })) emit("failed");
}
</script>
<template>
  <span class="sparkline-axis-menu">
    <RibbonMenuButton
      ref="button"
      variant="tall"
      :label="t('sparkline.axisMenu')"
      :text="t('sparkline.axisMenu')"
      :disabled="context.disabled"
      :expanded="open"
      :menu-id="menuId"
      @activate="toggleMenu"
      @keydown="onTriggerKeydown"
      ><Axis3D
    /></RibbonMenuButton>
    <Teleport to="body">
      <MenuSurface
        v-if="open"
        :id="menuId"
        ref="surface"
        :label="t('sparkline.axisMenu')"
        :style="floatingStyles"
      >
        <template #items>
          <SparklineAxisSection :label="t('sparkline.horizontalAxisOptions')">
            <MenuRadioItem checked indicator="check" @select="takeOwner(true)">{{
              t("sparkline.generalAxis")
            }}</MenuRadioItem>
            <MenuRadioItem
              :checked="false"
              disabled
              indicator="check"
              :title="t('sparkline.dateAxisUnavailable')"
              >{{ t("sparkline.dateAxis") }}…</MenuRadioItem
            >
            <MenuSeparator />
            <MenuItem
              role="menuitemcheckbox"
              :aria-checked="checked('axis')"
              data-sparkline-axis-action="axis"
              @select="toggle('axis')"
              ><template #icon
                ><Minus v-if="checked('axis') === 'mixed'" /><Check
                  v-else-if="checked('axis')" /></template
              >{{ t("sparkline.axis") }}</MenuItem
            >
            <MenuItem
              role="menuitemcheckbox"
              :aria-checked="checked('rightToLeft')"
              data-sparkline-axis-action="rightToLeft"
              @select="toggle('rightToLeft')"
              ><template #icon
                ><Minus v-if="checked('rightToLeft') === 'mixed'" /><Check
                  v-else-if="checked('rightToLeft')" /></template
              >{{ t("sparkline.rightToLeft") }}</MenuItem
            >
          </SparklineAxisSection>
          <SparklineAxisSection
            v-for="end in ends"
            :key="end"
            :label="t(end === 'minAxis' ? 'sparkline.minAxisOptions' : 'sparkline.maxAxisOptions')"
          >
            <MenuRadioItem
              indicator="check"
              :checked="mode(end) === 'individual'"
              :data-sparkline-axis-end="end"
              data-sparkline-axis-mode="individual"
              @select="limit(end, 'individual')"
              >{{ t("sparkline.axisIndividual") }}</MenuRadioItem
            >
            <MenuRadioItem
              indicator="check"
              :checked="mode(end) === 'group'"
              :data-sparkline-axis-end="end"
              data-sparkline-axis-mode="group"
              @select="limit(end, 'group')"
              >{{ t("sparkline.axisGroup") }}</MenuRadioItem
            >
            <MenuRadioItem
              indicator="check"
              :checked="mode(end) === 'custom'"
              :data-sparkline-axis-end="end"
              data-sparkline-axis-mode="custom"
              aria-haspopup="dialog"
              @select="limit(end, 'custom')"
              >{{ t("sparkline.axisCustom") }}…</MenuRadioItem
            >
          </SparklineAxisSection>
        </template>
      </MenuSurface>
    </Teleport>
  </span>
</template>
<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;
.sparkline-axis-menu {
  @include ribbon.tool;
}
</style>
