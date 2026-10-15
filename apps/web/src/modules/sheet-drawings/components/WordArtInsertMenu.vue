<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId, watch } from "vue";
import { ALargeSmall } from "lucide-vue-next";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import { useMenu } from "../../../shared/menu/useMenu";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";
import { useAppI18n } from "../../../shared/i18n";
import WordArtStyleGallery from "./WordArtStyleGallery.vue";
import type { WordArtStylePreset } from "../wordart-style-presets";
const props = defineProps<{
  disabled?: boolean;
  ownerId?: string | number;
  editSessionId?: string;
  handler: (choice: WordArtStylePreset) => boolean | Promise<boolean>;
}>();
const { t, locale } = useAppI18n();
const button = ref<InstanceType<typeof RibbonMenuButton>>();
const surface = ref<InstanceType<typeof MenuSurface>>();
const gallery = ref<InstanceType<typeof WordArtStyleGallery>>();
const triggerRef = computed(() => button.value?.rootElement ?? null);
const menuSurfaceRef = computed(() =>
  surface.value
    ? {
        rootElement: surface.value.rootElement,
        focusFirstItem: () => gallery.value?.focusSelected(),
        focusLastItem: () => gallery.value?.focusLast(),
      }
    : null,
);
const menuId = `wordart-insert-${useId().replaceAll(":", "")}`;
let generation = 0;
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef,
  menuSurfaceRef,
  disabled: computed(() => !!props.disabled),
  onOpen: () => generation++,
  onDismiss: () => generation++,
});
const select = computed(() => {
  void open.value;
  const token = generation,
    handler = props.handler,
    owner = props.ownerId;
  return async (choice: WordArtStylePreset): Promise<boolean> => {
    const valid = () =>
      open.value &&
      !props.disabled &&
      token === generation &&
      props.handler === handler &&
      props.ownerId === owner;
    if (!valid()) return false;
    const accepted = await handler(choice);
    // The host may update its owner/handler immediately on successful insertion.
    if (accepted && valid()) dismiss("programmatic", false);
    return accepted;
  };
});
watch(
  () => [props.handler, props.ownerId, props.editSessionId, props.disabled] as const,
  () => {
    generation++;
    dismiss("programmatic", false);
  },
  { flush: "sync" },
);
onBeforeUnmount(() => generation++);
</script>
<template>
  <span class="wordart-insert-tool" :data-cell-edit-session="editSessionId">
    <RibbonMenuButton
      ref="button"
      variant="tall"
      :label="t('drawing.wordArt')"
      :text="t('drawing.wordArt')"
      :disabled="disabled"
      :expanded="open"
      :menu-id="menuId"
      data-insert-tool="wordArt"
      popup-role="menu"
      @activate="toggleMenu"
      @keydown="onTriggerKeydown"
    >
      <ALargeSmall aria-hidden="true" />
    </RibbonMenuButton>
    <Teleport to="body">
      <MenuSurface
        v-if="open"
        :id="menuId"
        ref="surface"
        class="wordart-insert-menu"
        :style="floatingStyles"
        :label="t('drawing.wordArt')"
        :data-cell-edit-session="editSessionId"
      >
        <template #body>
          <WordArtStyleGallery
            ref="gallery"
            :locale="locale === 'zh-CN' ? 'zh-CN' : 'en-US'"
            :owner-id="ownerId"
            :disabled="disabled"
            :on-select="select"
          />
        </template>
      </MenuSurface>
    </Teleport>
  </span>
</template>
<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;
.wordart-insert-tool {
  @include ribbon.tool;
}
.wordart-insert-menu {
  width: 544px;
  max-width: calc(100vw - var(--sheetcraft-space-4) * 2);
  max-height: calc(100dvh - var(--sheetcraft-space-4) * 2);
  z-index: var(--sheetcraft-layer-menu);
}
</style>
