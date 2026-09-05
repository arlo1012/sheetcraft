# Web Component Contracts

Use the narrowest existing contract that expresses the product behavior. These
contracts belong to `apps/web`; they do not move workbook semantics out of
`@idea10/core` or Sheet interaction semantics out of `@idea10/sheet-engine`.

## Choose The Surface

Use TDesign directly when its public component API supplies the required
behavior. Keep its locale provider at the application root. Do not create a
one-to-one wrapper just to rename a TDesign prop.

Create or reuse a product component when the UI has a repeated product
behavior, stable styling, or accessibility contract. Examples are the shared
menu primitives and the ribbon's `RibbonIconAction`. A feature can use native
HTML controls when their semantics are sufficient.

Feature styles use `--idea-*` semantic tokens. The token definitions and the
TDesign variable mapping live in `src/shared/styles/`; local feature styles
must not target TDesign internal `.t-*` structure. The compact ribbon select
override is intentionally isolated in `_tdesign.scss`.

## Menus

`MenuSurface` provides a labelled `role="menu"`, one roving tab stop, arrow,
Home, and End navigation, disabled-item filtering, and dynamic-item syncing.
Use it with `MenuItem` and `MenuSeparator` for ordinary action menus.

```vue
<MenuSurface ref="menuSurfaceRef" :label="t('ribbon.sort')">
  <MenuItem @select="emit('sort', 'ascending')">
    {{ t('ribbon.sortAscending') }}
  </MenuItem>
  <MenuSeparator />
  <MenuItem danger :disabled="cannotDelete" @select="emit('delete')">
    {{ t('sheetTabs.deleteAction') }}
  </MenuItem>
</MenuSurface>
```

`MenuItem` emits `select` for pointer, Enter, and Space activation and exposes
`disabled`, `danger`, and menu-item role variants. Supply the menu's translated
label and translated item text; do not add literal user-facing strings.

`VerticalAlignmentMenu` is a deliberate local exception: its compact icon radio
panel needs selected-item entry and Tab transfer within the ribbon. Border
menus may also retain local panel logic for their nested controls. Reuse the
shared floating and focus behavior where it fits, and extract a new shared
contract only after another consumer needs the same special interaction.

## Floating Panels And Focus

Use `useDismissibleFloatingPanel(reference, floating, open, options)` for a
teleported popover, menu, or non-modal dialog. It applies fixed floating
placement and handles Escape, outside pointer, outside focus, and trigger
focus restoration. Use `additionalInside` when an open child panel belongs to
the same interaction.

```ts
const { floatingStyles, dismiss } = useDismissibleFloatingPanel(triggerRef, menuRef, open, {
  offset: 4,
  onDismiss: () => {
    open.value = false;
  },
});
```

Open menu panels by focusing `MenuSurface.focusFirstItem()` or
`focusLastItem()` after the next tick. For a specialized list, use
`useRovingFocus()` for ArrowUp, ArrowDown, Home, and End rather than duplicate
the movement rules. Restore the trigger only when dismissal semantics require
it; context menus can retain their own appropriate focus target.

Use `getWorkbookHistoryShortcut(event)` for toolbar and grid undo/redo
handling. It recognizes Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z, and Ctrl/Cmd+Y while
preserving native editable-control history unless the owning surface explicitly
opts in with `allowEditableTarget`.

## Translated And Accessible Controls

Use the shared translator for labels and feedback:

```ts
const { t } = useAppI18n();
const label = t("ribbon.freeze");
```

When a control has state, set the matching ARIA state (`aria-expanded`,
`aria-controls`, `aria-checked`, or `aria-disabled`) and keep focus behavior
testable. New shared interaction behavior needs focused tests under
`apps/web/src/tests/shared`; feature behavior belongs in its matching module
test directory.
