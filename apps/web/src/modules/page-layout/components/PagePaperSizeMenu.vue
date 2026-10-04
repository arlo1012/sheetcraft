<script setup lang="ts">
import { FileStack } from "lucide-vue-next";
import { computed, ref, useId } from "vue";
import type { SheetPageSetup, SheetPaperSize } from "@idea10/core/page-setup";
import { useAppI18n } from "../../../shared/i18n";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import PagePaperSizeOption from "./PagePaperSizeOption.vue";
import MenuSeparator from "../../../shared/menu/MenuSeparator.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import { useMenu } from "../../../shared/menu/useMenu";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";

const props = defineProps<{ setup: SheetPageSetup; disabled: boolean }>();
const emit = defineEmits<{ change: [patch: Partial<SheetPageSetup>]; openSetup: [] }>();
const { t } = useAppI18n();
const buttonRef = ref<InstanceType<typeof RibbonMenuButton> | null>(null);
const triggerRef = computed(() => buttonRef.value?.rootElement ?? null);
const menuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const menuId = `page-paper-size-menu-${useId().replaceAll(":", "")}`;
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef,
  menuSurfaceRef,
  disabled: computed(() => props.disabled),
  defaultFocus: "selected",
});

function select(paperSize: Exclude<SheetPaperSize, "custom">): void {
  emit("change", { paperSize });
  dismiss("programmatic", true);
}
function openSetup(): void {
  dismiss("programmatic", false);
  emit("openSetup");
}
</script>

<template>
  <span class="page-paper-size-menu">
    <RibbonMenuButton
      ref="buttonRef"
      variant="tall"
      :label="t('pageLayout.paperSize')"
      :text="t('pageLayout.paperSize')"
      :disabled="disabled"
      :expanded="open"
      :menu-id="menuId"
      data-page-tool="paper-size"
      @activate="toggleMenu"
      @keydown="onTriggerKeydown"
      ><FileStack aria-hidden="true"
    /></RibbonMenuButton>
    <Teleport to="body">
      <MenuSurface
        v-if="open"
        :id="menuId"
        ref="menuSurfaceRef"
        class="page-paper-size-menu__surface"
        :style="floatingStyles"
        :label="t('pageLayout.paperSize')"
      >
        <template #items>
          <PagePaperSizeOption
            paper-size="letter"
            :checked="setup.paperSize === 'letter'"
            @select="select('letter')"
          />
          <PagePaperSizeOption
            paper-size="tabloid"
            :checked="setup.paperSize === 'tabloid'"
            @select="select('tabloid')"
          />
          <PagePaperSizeOption
            paper-size="legal"
            :checked="setup.paperSize === 'legal'"
            @select="select('legal')"
          />
          <PagePaperSizeOption
            paper-size="statement"
            :checked="setup.paperSize === 'statement'"
            @select="select('statement')"
          />
          <PagePaperSizeOption
            paper-size="executive"
            :checked="setup.paperSize === 'executive'"
            @select="select('executive')"
          />
          <PagePaperSizeOption
            paper-size="a3"
            :checked="setup.paperSize === 'a3'"
            @select="select('a3')"
          />
          <PagePaperSizeOption
            paper-size="a4"
            :checked="setup.paperSize === 'a4'"
            @select="select('a4')"
          />
          <PagePaperSizeOption
            paper-size="a5"
            :checked="setup.paperSize === 'a5'"
            @select="select('a5')"
          />
          <PagePaperSizeOption
            paper-size="b4-jis"
            :checked="setup.paperSize === 'b4-jis'"
            @select="select('b4-jis')"
          />
          <PagePaperSizeOption
            paper-size="b5-jis"
            :checked="setup.paperSize === 'b5-jis'"
            @select="select('b5-jis')"
          />
        </template>
        <template #footer>
          <MenuSeparator />
          <MenuItem data-page-paper-size="custom" @select="openSetup">{{
            t("pageLayout.otherPaperSizes")
          }}</MenuItem>
        </template>
      </MenuSurface>
    </Teleport>
  </span>
</template>

<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;
.page-paper-size-menu {
  @include ribbon.tool;
  &__surface {
    z-index: var(--idea-layer-menu);
    min-width: 220px;
  }
}
</style>
