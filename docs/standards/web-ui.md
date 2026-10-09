# Web UI Standards

## Reuse and ownership

- Before building, find the closest existing UI; user references take priority.
  Prefer project components, then
  TDesign public APIs, then a new component for a real gap. Do not replace a
  fitting library control or wrap it one-for-one.
- Repeated visible structure belongs in a shared component with typed props,
  emits, and slots. Features keep their data, commands, and domain
  interactions; consumers supply variable content through slots rather than copied
  markup or CSS. Gallery titles span the surface; only the content owns insets.
- Keep shared contracts small and explicit. Do not import another feature's
  private components or copy its styles. One-off behavior stays local; extract
  only stable duplication. Concrete Vue components must be explicitly composed;
  do not use visual registries or `<component :is>` factories.
- Features own placement, layout, and size limits. Shared components own type,
  padding, border, radius, shadow, scrollbar, and interaction states. Use product
  tokens; TDesign adaptation belongs in the shared adapter, never a feature-local
  `.t-*` override.
- Using a shared surface does not permit restyling its shell: do not override
  its padding, background, border, radius, or shadow from a consumer class.
  `MenuSurface` and `FloatingPanelSurface` share the same chrome. Content insets
  belong to the content component; grouped galleries use `GallerySection`.
  Use `contentInset=false` only when a section contains groups that already own
  their insets. Gallery choice buttons use `shared/gallery/gallery-choice` for
  hover, selected, focus, and disabled states; previews keep domain-specific drawing.

| Pattern                   | Reference                                                        |
| ------------------------- | ---------------------------------------------------------------- |
| Grouped preset galleries  | `shared/gallery/GallerySection.vue`                              |
| Option lists              | `shared/option-list/OptionList.vue`, `CellFormatDialog`          |
| Searchable menus          | `shared/menu/MenuSearch.vue`, `WorkbookSheetNavigator`           |
| Inputs and dialog actions | TDesign controls and `CellFormatDialog`; cancel precedes confirm |

## Data tables

- Use TDesign `BaseTable` or `PrimaryTable` directly with `idea-table--mini` and
  `size="small"`; keep library overrides in the shared TDesign adapter.
- For a bounded or scrollable table, give its feature-owned outer container a
  definite height and `min-height: 0`. Place `TableHeightWrapper` inside it and
  pass the slot's `height` to the table. Let the table own scrolling; avoid a
  second scrolling shell or independent height measurement.
- Use table props and slots for headerless matrix previews and cell rendering,
  rather than recreating table styling with native HTML tables.

## Typography

Use CSS pixels at 100% scale; size and line height are a pair.

| Role            | Size / line height | Weight | Uses                                            |
| --------------- | ------------------ | ------ | ----------------------------------------------- |
| Supporting      | 12px / 18px        | 400    | Hints, shortcuts, group captions, sheet headers |
| Interface       | 12px / 20px        | 400    | Controls, menus, tabs, inputs                   |
| Section heading | 14px / 22px        | 600    | Panels and popovers                             |
| Dialog heading  | 16px / 24px        | 600    | Dialog titles                                   |

- Use product typography tokens and `--sheetcraft-font-sans`. Selected navigation and
  small group headings may use 500. States never change text size or line
  height; do not use 11px interface text.
- A 28px control uses 12px / 20px. Change its container, not its text. Numeric
  samples may use 14px / 22px at 400. Workbook content, editors, row sizing,
  exports, and style previews follow workbook typography; sheet headers retain zoom.

## Surfaces, controls, and focus

| Surface        | Padding                    | Owner                                                                   |
| -------------- | -------------------------- | ----------------------------------------------------------------------- |
| Content panel  | 8px, inside border         | `--sheetcraft-tool-panel-padding`                                       |
| List menu      | 8px vertical, 0 horizontal | `--sheetcraft-menu-padding`; rows own insets                            |
| Dialog frame   | 16px                       | Shared TDesign adapter                                                  |
| Dialog content | 12px vertical              | `--sheetcraft-dialog-content-padding-block`; adapter or body-owning tab |

- One layer owns each inset. Keep control/row padding and gaps separate; hover
  and selected menu backgrounds span the row. Suggestions, input assists, and
  compact floating toolbars retain their own density.
- Ribbon tools and standalone icon actions use lightweight containers with
  `vIconAction` for button roles, keyboard activation, focus, and disabled semantics;
  provide an accessible name. Other controls use native/library buttons.
  Input prefix/suffix icons use slots; the input owns their
  spacing. Stop action clicks from bubbling into the input focus handler.
- `InputNumber` uses `theme="column"` and
  `idea-input-number--persistent-controls`; place it in a labelled group. Use
  no native `label` wrapper, which would forward focus to its buttons. Use
  `--sheetcraft-icon-button-hover-bg` for ribbon/status icon hover; foreground stays
  unchanged.
- Ordinary controls inherit shared focus styling. Menu/list keyboard focus uses
  `--sheetcraft-keyboard-focus-bg`; compact triggers use
  `--sheetcraft-keyboard-focus-shadow` with their existing radius. Keep focus visible
  and separate from selected/checked state. Do not add feature-local focus
  overrides; canvas/SVG editing may keep target-specific feedback.

## Dialog and popover actions

- Use `NewCellStyleDialog` (the Style dialog) as the reference for footer actions.
  Prefer TDesign Dialog's built-in `confirmBtn` and `cancelBtn` APIs. Custom
  dialog footers and popover action rows must use the same button modes:
  secondary actions such as Cancel use `theme="default"` and `variant="base"`
  (gray background at rest); primary actions use `theme="primary"` and
  `variant="base"`. Place Cancel before the primary action.
- Secondary footer actions have no visible border, including hover and pressed
  states. Keep background feedback and visible keyboard focus. Removing an
  `outline` button's border does not make it equivalent to the gray `base`
  variant; use the correct public button mode. Shared TDesign adaptation owns
  border styling; do not recreate it in feature CSS.
- If the only footer action dismisses the dialog (Close, Cancel, or equivalent),
  omit the entire footer with `:footer="false"` and retain an accessible header
  close control. Apply this to conditional read-only/result states too. Move any
  useful footer explanation into the body. Keep footers that contain meaningful
  actions such as Save, Apply, or workflow navigation.
- Apply these rules to new and modified UI. Existing exceptions are migrated
  incrementally when their UI is being updated.

## Ribbon and menus

- Action/menu icons use `--sheetcraft-action-icon-size` (15px); tall ribbon actions
  use `--sheetcraft-ribbon-large-icon-size` (22px); Lucide stroke is
  `--sheetcraft-icon-stroke-width` (2). Auxiliary/control icons keep their own shared
  sizes; border previews keep semantic line weights. Feature slots do not set
  action size or stroke.
- Compose tab groups inside `RibbonToolbar`; it owns viewport, rail, overflow,
  and focus visibility. Use its `ribbon.columns`, `compact`, `stack`,
  `two-rows`, and `row` shells. Tall and stacked actions share two 26px rows
  with a 2px gap (54px total). Large-tool captions and the second row of compact
  tools must share the same text baseline; feedback surfaces do not alter layout.
- In `shared/ribbon`, use `RibbonButton` for actions, `RibbonMenuButton` for
  triggers, and `RibbonSplitButton` for action plus popup. Controls own icon,
  text, arrow, focus, and disabled state; groups own arrangement.
  Tool feedback uses neutral backgrounds without recoloring icons. Split tools
  highlight each action independently: compact tools split left/right, tall tools
  split the icon action above the text/menu action. Containers own row sizing.
- Use `fullWidth` to fill a component slot; never pass a parent scoped class
  through a child root for positioning. Keep a grouped trigger and teleported
  popup under one local root, and forward keyboard/ARIA attributes to the
  interactive element.
- Use `useMenu` with `MenuSurface` for normal menu opening, keyboard navigation,
  dismissal, and focus restoration. Use `MenuItem` for commands and
  `MenuRadioItem` for single choices. Consumers set placement, width, height
  limits, and stacking; shared code owns rows, padding, indicators, radius, and
  shadow. Text menus size to content; reserve fixed widths for inputs, searchable
  lists, and compact preset grids.

## Floating content and context menus

Use the shared primitives before adding any floating UI. `FloatingPanelSurface`
owns a plain popover/panel surface; `useMenu` plus `MenuSurface` owns a command
menu; `useContextMenu` opens that menu from a pointer or keyboard anchor; and
`useSubmenu` owns submenu disclosure and focus transfer. `MenuSurface` body and
footer slots support searchable/scrolling content and fixed actions without a
feature recreating the surface. Use the `items` slot for menu rows (it supplies
the inner list), and `body` for gallery/content blocks. Use `bodyScrollable=false` when the body contains
independently scrolling groups, as in theme colors. A feature owns its commands, variable content,
placement, and size limits; the primitives own positioning, dismissal, focus
return, menu roles, rows, surface treatment, and overlay layer.

- Search `shared/floating` and `shared/menu` first. If the behavior is missing,
  extend the closest primitive with a typed prop, emit, composable option, or
  named slot that can serve another consumer. Do not import Floating UI directly
  outside `shared/floating`, or create a feature-local document dismissal loop.
- Use `--sheetcraft-layer-menu`, `--sheetcraft-layer-submenu`, `--sheetcraft-layer-context-menu`,
  `--sheetcraft-layer-context-submenu`, `--sheetcraft-layer-popover`, and
  `--sheetcraft-layer-popover-submenu`, `--sheetcraft-layer-toolbar`, and
  `--sheetcraft-layer-sheet-menu` for document-level overlays. Numeric `z-index` values
  through 30 are only for local composition within a component; values above that
  threshold are reserved and rejected by `bun run check:web-ui`.
- Use `MenuSurface` for menu semantics. `BorderLineStylePanel` is the intentional
  shared exception because its grid has specialized radio-item interaction. Use
  native TDesign dialogs directly when their public API fits; this policy does
  not introduce wrappers for ordinary dialogs.

## Review

Before committing, remove copied controls/CSS, undefined tokens, and unexplained
differences from the reference. Run the scoped checks required by the repository;
static checks do not establish visual consistency.
