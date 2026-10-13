<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId, watch } from "vue";
import { Type, TextCursorInput } from "lucide-vue-next";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";
import { useMenu } from "../../../shared/menu/useMenu";
import { useAppI18n } from "../../../shared/i18n";
import { TEXT_BOX_CHOICES, type ShapeTextBoxChoice } from "../shape-gallery";

const props = defineProps<{
  disabled?: boolean;
  ownerId?: string | number;
  editSessionId?: string;
  handler: (choice: ShapeTextBoxChoice, continuous: boolean) => boolean;
}>();
const { t, locale } = useAppI18n();
const choices = TEXT_BOX_CHOICES;
const language = computed(() => (locale.value === "zh-CN" ? "zh-CN" : "en-US"));
const button = ref<InstanceType<typeof RibbonMenuButton>>();
const surface = ref<InstanceType<typeof MenuSurface>>();
const triggerRef = computed(() => button.value?.rootElement ?? null);
const menuSurfaceRef = computed(() => surface.value ?? null);
const menuId = `text-box-insert-${useId().replaceAll(":", "")}`;
const rejected = ref(false);
const generation = ref(0);
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef,
  menuSurfaceRef,
  disabled: computed(() => !!props.disabled),
  onOpen: () => {
    generation.value++;
    rejected.value = false;
  },
  onDismiss: () => {
    generation.value++;
    rejected.value = false;
  },
});
const choose = computed(() => {
  void open.value;
  const token = generation.value,
    owner = props.ownerId,
    handler = props.handler;
  const select = (choice: ShapeTextBoxChoice): void => {
    const valid = () =>
      open.value &&
      !props.disabled &&
      token === generation.value &&
      props.ownerId === owner &&
      props.handler === handler;
    if (!valid()) return;
    let accepted = false;
    try {
      accepted = handler(choice, false) === true;
    } catch {
      /* Keep retry available. */
    }
    if (!valid()) return;
    if (accepted) dismiss("programmatic", false);
    else rejected.value = true;
  };
  return {
    horizontal: () => select(choices.horizontal),
    vertical: () => select(choices.vertical),
  };
});
watch(
  () => [props.ownerId, props.handler, props.editSessionId, props.disabled] as const,
  () => {
    generation.value++;
    dismiss("programmatic", false);
  },
  { flush: "sync" },
);
onBeforeUnmount(() => generation.value++);
</script>
<template>
  <span class="text-box-insert-tool" :data-cell-edit-session="editSessionId">
    <RibbonMenuButton
      ref="button"
      variant="tall"
      :label="t('drawing.textBox')"
      :text="t('drawing.textBox')"
      :disabled="disabled"
      :expanded="open"
      :menu-id="menuId"
      data-insert-tool="text-box"
      popup-role="menu"
      @activate="toggleMenu"
      @keydown="onTriggerKeydown"
      ><Type aria-hidden="true"
    /></RibbonMenuButton>
    <Teleport to="body">
      <MenuSurface
        v-if="open"
        :id="menuId"
        ref="surface"
        class="text-box-insert-menu"
        :style="floatingStyles"
        :label="t('drawing.textBox')"
        :data-cell-edit-session="editSessionId"
        :data-text-box-insert-owner="ownerId"
      >
        <template #items>
          <MenuItem
            :disabled="disabled"
            data-text-box-direction="horizontal"
            @select="choose.horizontal"
          >
            <template #icon><TextCursorInput :size="15" /></template>
            {{ choices.horizontal.label[language] }}
          </MenuItem>
          <MenuItem
            :disabled="disabled"
            data-text-box-direction="vertical"
            @select="choose.vertical"
          >
            <template #icon><Type :size="15" style="transform: rotate(90deg)" /></template>
            {{ choices.vertical.label[language] }}
          </MenuItem>
        </template>
        <template #footer>
          <li class="text-box-insert-menu__hint" role="none">
            {{ t("drawing.textBoxDrawingHint") }}
          </li>
          <li v-if="rejected" class="text-box-insert-menu__hint" role="status" aria-live="polite">
            {{ t("drawing.textBoxSelectionRejected") }}
          </li>
        </template>
      </MenuSurface>
    </Teleport>
  </span>
</template>
<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;
.text-box-insert-tool {
  @include ribbon.tool;
}
.text-box-insert-menu {
  width: 280px;
  max-width: calc(100vw - var(--sheetcraft-space-4) * 2);
  z-index: var(--sheetcraft-layer-menu);
  &__hint {
    padding: var(--sheetcraft-space-2) var(--sheetcraft-tool-panel-padding);
    color: var(--sheetcraft-text-secondary);
    font-size: var(--sheetcraft-font-size-body-small);
    line-height: 1.5;
    list-style: none;
  }
}
</style>
