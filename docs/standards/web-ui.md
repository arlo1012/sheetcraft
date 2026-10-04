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

| Pattern                   | Reference                                                        |
| ------------------------- | ---------------------------------------------------------------- |
| Grouped preset galleries  | `shared/gallery/GallerySection.vue`                              |
| Option lists              | `shared/option-list/OptionList.vue`, `CellFormatDialog`          |
| Searchable menus          | `shared/menu/MenuSearch.vue`, `WorkbookSheetNavigator`           |
| Inputs and dialog actions | TDesign controls and `CellFormatDialog`; cancel precedes confirm |

## Typography

Use CSS pixels at 100% scale; size and line height are a pair.

| Role            | Size / line height | Weight | Uses                                            |
| --------------- | ------------------ | ------ | ----------------------------------------------- |
| Supporting      | 12px / 18px        | 400    | Hints, shortcuts, group captions, sheet headers |
| Interface       | 12px / 20px        | 400    | Controls, menus, tabs, inputs                   |
| Section heading | 14px / 22px        | 600    | Panels and popovers                             |
| Dialog heading  | 16px / 24px        | 600    | Dialog titles                                   |

- Use product typography tokens and `--idea-font-sans`. Selected navigation and
  small group headings may use 500. States never change text size or line
  height; do not use 11px interface text.
- A 28px control uses 12px / 20px. Change its container, not its text. Numeric
  samples may use 14px / 22px at 400. Workbook content, editors, row sizing,
  exports, and style previews follow workbook typography; sheet headers retain zoom.

## Surfaces, controls, and focus

| Surface        | Padding                    | Owner                                                             |
| -------------- | -------------------------- | ----------------------------------------------------------------- |
| Content panel  | 8px, inside border         | `--idea-tool-panel-padding`                                       |
| List menu      | 8px vertical, 0 horizontal | `--idea-menu-padding`; rows own insets                            |
| Dialog frame   | 16px                       | Shared TDesign adapter                                            |
| Dialog content | 12px vertical              | `--idea-dialog-content-padding-block`; adapter or body-owning tab |

- One layer owns each inset. Keep control/row padding and gaps separate; hover
  and selected menu backgrounds span the row. Suggestions, input assists, and
  compact floating toolbars retain their own density.
- Use native/library buttons except for a single visible icon. Standalone icon
  containers use `vIconAction`, an accessible name, keyboard activation, and
  disabled semantics. Input prefix/suffix icons use slots; the input owns their
  spacing. Stop action clicks from bubbling into the input focus handler.
- `InputNumber` uses `theme="column"` and
  `idea-input-number--persistent-controls`; place it in a labelled group. Use
  no native `label` wrapper, which would forward focus to its buttons. Use
  `--idea-icon-button-hover-bg` for ribbon/status icon hover; foreground stays
  unchanged.
- Ordinary controls inherit shared focus styling. Menu/list keyboard focus uses
  `--idea-keyboard-focus-bg`; compact triggers use
  `--idea-keyboard-focus-shadow` with their existing radius. Keep focus visible
  and separate from selected/checked state. Do not add feature-local focus
  overrides; canvas/SVG editing may keep target-specific feedback.

## Ribbon and menus

- Action/menu icons use `--idea-action-icon-size` (15px); tall ribbon actions
  use `--idea-ribbon-large-icon-size` (18px); Lucide stroke is
  `--idea-icon-stroke-width` (2). Auxiliary/control icons keep their own shared
  sizes; border previews keep semantic line weights. Feature slots do not set
  action size or stroke.
- Compose tab groups inside `RibbonToolbar`; it owns viewport, rail, overflow,
  and focus visibility. Use its `ribbon.columns`, `compact`, `stack`,
  `two-rows`, and `row` shells. Tall and stacked actions share 54px: two 26px
  rows with a 2px gap, derived from ribbon tokens.
- In `shared/ribbon`, use `RibbonButton` for actions, `RibbonMenuButton` for
  triggers, and `RibbonSplitButton` for action plus popup. Controls own icon,
  text, arrow, focus, and disabled state; groups own arrangement.
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

## Review

Before committing, remove copied controls/CSS, undefined tokens, and unexplained
differences from the reference. Run the scoped checks required by the repository;
static checks do not establish visual consistency.
