<script setup lang="ts">
import { ChevronRight } from "lucide-vue-next";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId } from "vue";
import { useDismissibleFloatingPanel } from "../../../shared/floating/useDismissibleFloatingPanel";
import {
  useFloatingPanel,
  type FloatingReference,
} from "../../../shared/floating/useFloatingPanel";
import { useAppI18n } from "../../../shared/i18n";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSeparator from "../../../shared/menu/MenuSeparator.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";

const STACKED_SUBMENU_BREAKPOINT = 480;

const props = withDefaults(
  defineProps<{
    anchor: FloatingReference;
    pasteSpecialDisabled?: boolean;
    pasteFormatsDisabled?: boolean;
    cutDisabledReason?: string;
    hasImage?: boolean;
  }>(),
  {
    pasteSpecialDisabled: false,
    pasteFormatsDisabled: false,
  },
);

const emit = defineEmits<{
  cut: [];
  copy: [];
  paste: [];
  pasteValues: [];
  pasteFormats: [];
  convertImageToFloating: [];
  previewImage: [];
  clear: [];
  close: [restoreFocus: boolean];
}>();

const { t } = useAppI18n();
const menuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const submenuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const menuRef = computed<HTMLElement | null>(() => menuSurfaceRef.value?.rootElement ?? null);
const submenuRef = computed<HTMLElement | null>(() => submenuSurfaceRef.value?.rootElement ?? null);
const pasteSpecialAnchor = computed<HTMLElement | null>(
  () => menuRef.value?.querySelector<HTMLElement>('[data-cell-action="paste-special"]') ?? null,
);
const menuOpen = computed(() => true);
const submenuOpen = ref(false);
const stackedSubmenu = ref(false);
const menuAnchor = computed(() => props.anchor);
const submenuId = `sheet-cell-paste-special-${useId().replaceAll(":", "")}`;
const { floatingStyles } = useDismissibleFloatingPanel(menuAnchor, menuRef, menuOpen, {
  offset: 4,
  additionalInside: () => [submenuRef.value],
  onDismiss: ({ restoreFocus }) => emit("close", restoreFocus),
});
const submenuAnchor = computed(() =>
  stackedSubmenu.value ? menuRef.value : pasteSpecialAnchor.value,
);
const submenuPlacement = computed(() =>
  stackedSubmenu.value ? ("bottom-end" as const) : ("right-start" as const),
);
const { floatingStyles: submenuStyles } = useFloatingPanel(submenuAnchor, submenuRef, submenuOpen, {
  placement: submenuPlacement,
  offset: 4,
});

function updateSubmenuLayout(): void {
  stackedSubmenu.value = window.innerWidth < STACKED_SUBMENU_BREAKPOINT;
}

onMounted(() => {
  updateSubmenuLayout();
  window.addEventListener("resize", updateSubmenuLayout);
  void nextTick(() => menuSurfaceRef.value?.focusFirstItem());
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", updateSubmenuLayout);
});

function onShortcutKeydown(event: KeyboardEvent): boolean {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) {
    return false;
  }
  const action = event.key.toLowerCase();
  if (action !== "x" && action !== "c" && action !== "v") {
    return false;
  }
  event.preventDefault();
  event.stopPropagation();
  if (action === "x") {
    if (!props.cutDisabledReason) emit("cut");
  } else if (action === "c") {
    emit("copy");
  } else {
    emit("paste");
  }
  return true;
}

function openPasteSpecial(): void {
  if (props.pasteSpecialDisabled) {
    return;
  }
  submenuOpen.value = true;
  void nextTick(() => submenuSurfaceRef.value?.focusFirstItem());
}

function closePasteSpecial(restoreFocus: boolean): void {
  submenuOpen.value = false;
  if (restoreFocus) {
    void nextTick(() => pasteSpecialAnchor.value?.focus());
  }
}

function onMenuKeydown(event: KeyboardEvent): void {
  if (onShortcutKeydown(event)) {
    return;
  }
  const target = event.target instanceof Element ? event.target : null;
  if (
    event.key === "ArrowRight" &&
    target?.closest('[data-cell-action="paste-special"]') &&
    !props.pasteSpecialDisabled
  ) {
    event.preventDefault();
    event.stopPropagation();
    openPasteSpecial();
  }
}

function onMenuFocusin(event: FocusEvent): void {
  const target = event.target instanceof Element ? event.target : null;
  if (submenuOpen.value && !target?.closest('[data-cell-action="paste-special"]')) {
    closePasteSpecial(false);
  }
}

function onSubmenuKeydown(event: KeyboardEvent): void {
  if (onShortcutKeydown(event)) {
    return;
  }
  if (event.key === "Escape" || event.key === "ArrowLeft") {
    event.preventDefault();
    event.stopPropagation();
    closePasteSpecial(true);
  }
}
</script>

<template>
  <Teleport to="body">
    <MenuSurface
      ref="menuSurfaceRef"
      class="sheet-cell-context-menu"
      :style="floatingStyles"
      :label="t('cellMenu.actions')"
      @focusin="onMenuFocusin"
      @keydown="onMenuKeydown"
    >
      <MenuItem
        data-cell-action="cut"
        aria-keyshortcuts="Control+X Meta+X"
        :disabled="Boolean(cutDisabledReason)"
        :title="cutDisabledReason"
        :aria-description="cutDisabledReason"
        @select="emit('cut')"
      >
        {{ t("cellMenu.cut") }}
        <template #shortcut>{{ t("cellMenu.cutShortcut") }}</template>
      </MenuItem>
      <MenuItem data-cell-action="copy" aria-keyshortcuts="Control+C Meta+C" @select="emit('copy')">
        {{ t("cellMenu.copy") }}
        <template #shortcut>{{ t("cellMenu.copyShortcut") }}</template>
      </MenuItem>
      <MenuItem
        data-cell-action="paste"
        aria-keyshortcuts="Control+V Meta+V"
        @select="emit('paste')"
      >
        {{ t("cellMenu.paste") }}
        <template #shortcut>{{ t("cellMenu.pasteShortcut") }}</template>
      </MenuItem>
      <MenuItem
        data-cell-action="paste-special"
        aria-haspopup="menu"
        :aria-expanded="submenuOpen"
        :aria-controls="submenuOpen ? submenuId : undefined"
        :disabled="pasteSpecialDisabled"
        @select="openPasteSpecial"
      >
        {{ t("cellMenu.pasteSpecial") }}
        <template #shortcut>
          <ChevronRight :size="15" aria-hidden="true" />
        </template>
      </MenuItem>
      <MenuSeparator />
      <template v-if="hasImage">
        <MenuItem data-cell-action="preview-image" @select="emit('previewImage')">
          {{ t("image.preview") }}
        </MenuItem>
        <MenuItem
          data-cell-action="convert-image-to-floating"
          @select="emit('convertImageToFloating')"
        >
          {{ t("image.convertToFloating") }}
        </MenuItem>
        <MenuSeparator />
      </template>
      <MenuItem data-cell-action="clear" @select="emit('clear')">
        {{ t("cellMenu.clearContents") }}
      </MenuItem>
    </MenuSurface>
    <MenuSurface
      v-if="submenuOpen"
      :id="submenuId"
      ref="submenuSurfaceRef"
      class="sheet-cell-context-menu sheet-cell-context-menu--paste-special"
      :style="submenuStyles"
      :label="t('cellMenu.pasteSpecial')"
      :data-paste-special-layout="stackedSubmenu ? 'stacked' : 'side'"
      @keydown="onSubmenuKeydown"
    >
      <MenuItem data-cell-action="paste-values" @select="emit('pasteValues')">
        {{ t("cellMenu.pasteValues") }}
      </MenuItem>
      <MenuItem
        data-cell-action="paste-formats"
        :disabled="pasteFormatsDisabled"
        @select="emit('pasteFormats')"
      >
        {{ t("cellMenu.pasteFormats") }}
      </MenuItem>
    </MenuSurface>
  </Teleport>
</template>

<style scoped lang="scss">
.sheet-cell-context-menu {
  z-index: 100;
  width: 195px;

  &--paste-special {
    z-index: 101;
    width: 168px;
  }
}
</style>
