<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId, watch } from "vue";
import { Type } from "lucide-vue-next";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import RibbonSplitButton from "../../../shared/ribbon/RibbonSplitButton.vue";
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
const button = ref<InstanceType<typeof RibbonSplitButton>>();
const surface = ref<InstanceType<typeof MenuSurface>>();
const triggerRef = computed(() => button.value?.menuElement ?? null);
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

function activateDirect(): void {
  if (props.disabled) return;
  if (open.value) dismiss("programmatic", false);
  try {
    props.handler(choices.horizontal, false);
  } catch {
    /* Ignore direct-activation rejection and keep toolbar responsive. */
  }
}

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
    <RibbonSplitButton
      ref="button"
      variant="tall"
      :label="choices.horizontal.label[language]"
      :menu-label="t('drawing.textBox')"
      :text="t('drawing.textBox')"
      :disabled="disabled"
      :menu-disabled="disabled"
      :expanded="open"
      :menu-id="menuId"
      data-insert-tool="text-box"
      popup-role="menu"
      @activate="activateDirect"
      @toggle-menu="toggleMenu"
      @menu-keydown="onTriggerKeydown"
      ><Type aria-hidden="true"
    /></RibbonSplitButton>
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
            :title="t('drawing.textBoxDrawingHint')"
            :aria-description="t('drawing.textBoxDrawingHint')"
            data-text-box-direction="horizontal"
            @select="choose.horizontal"
          >
            <template #icon>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <path d="M6.5 9h5M9 9v6" />
                <path d="M13.5 12h4.5M16 10l2 2-2 2" />
              </svg>
            </template>
            {{ choices.horizontal.label[language] }}
          </MenuItem>
          <MenuItem
            :disabled="disabled"
            :title="t('drawing.textBoxDrawingHint')"
            :aria-description="t('drawing.textBoxDrawingHint')"
            data-text-box-direction="vertical"
            @select="choose.vertical"
          >
            <template #icon>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <rect x="4" y="3" width="16" height="18" rx="2" />
                <path d="M7.5 7.5h5M10 7.5v5.5" />
                <path d="M15 8v8M13 14l2 2 2-2" />
              </svg>
            </template>
            {{ choices.vertical.label[language] }}
          </MenuItem>
        </template>
        <template v-if="rejected" #footer>
          <li class="text-box-insert-menu__hint" role="status" aria-live="polite">
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
  max-width: calc(100vw - var(--sheetcraft-space-4) * 2);
  z-index: var(--sheetcraft-layer-menu);
  &__hint {
    padding: var(--sheetcraft-space-2) var(--sheetcraft-tool-panel-padding);
    color: var(--sheetcraft-text-secondary);
    font-size: var(--sheetcraft-font-size-body-small);
    line-height: var(--sheetcraft-line-height-body-small);
    list-style: none;
  }
}
</style>
