# Web UI Standards

## Reuse first

- Before implementation, inspect and name the existing UI to reuse; user references
  take priority. Prefer **project components → TDesign public APIs → new components
  for confirmed gaps**. Routine reuse needs no approval; avoid native replacements
  and one-to-one wrappers for existing controls.
- Share implementations, not copied feature CSS or imports of another feature's
  private components. Keep business state local; extract repeated contracts into
  shared components or SCSS primitives.
- Features own layout, placement, and size limits. Shared components own typography,
  padding, borders, radii, shadows, scrollbars, and interaction states. Use product
  tokens; keep TDesign adaptations in the shared adapter, never feature `.t-*`
  overrides. Prefer public props/local variables and preserve nested defaults.
- Before committing, remove duplicated controls, undefined tokens, and unexplained
  differences from the reference. Static checks do not establish visual consistency;
  follow the repository's scoped verification policy.

| Pattern                 | Reference / implementation                                                                                                               |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Option lists            | `CellFormatDialog` number categories/date types; `shared/option-list/OptionList.vue` and SCSS                                            |
| Searchable menus        | `WorkbookSheetNavigator`, `shared/menu/MenuSearch.vue`, shared menu components                                                           |
| Inputs / dialog actions | TDesign controls and `CellFormatDialog` defaults; preserve sizes, spacing, themes, and cancel-before-confirm order in custom footers too |

## Typography

CSS pixels at 100% scale; size and line height are a pair.

| Role                | Size / line height | Weight | Uses                                                                   |
| ------------------- | ------------------ | ------ | ---------------------------------------------------------------------- |
| Supporting          | 12px / 18px        | 400    | Status, shortcuts, hints, tooltips, group captions, row/column headers |
| Interface (default) | 12px / 20px        | 400    | Controls, menus, tabs, labels, formula/address/search inputs           |
| Section heading     | 14px / 22px        | 600    | Panels and popovers                                                    |
| Dialog heading      | 16px / 24px        | 600    | Dialog titles                                                          |

- Use product typography tokens and `--idea-font-sans`, mapped through the TDesign
  adapter. Selected navigation/small group headings use weight 500; interaction
  states must not change text size or line height. No 11px interface text.
- A default 28px control uses 12px / 20px text. Adjust its container, not the text;
  icon sizes remain independent. Numeric samples may use 14px / 22px at weight 400.
- Cell content, editors, document fonts, row measurement, export, and cell-style
  previews follow workbook typography. Header text retains Sheet zoom behavior;
  `fx`, `+`, and narrow-cell image placeholders are not additional text roles.

## Spacing and integration

| Surface        | Padding                      | Owner                                                                                       |
| -------------- | ---------------------------- | ------------------------------------------------------------------------------------------- |
| Content panels | 8px all sides, inside border | `--idea-tool-panel-padding`                                                                 |
| List menus     | 8px vertical, 0 horizontal   | `--idea-menu-padding`; rows own text/icon insets                                            |
| Dialog frame   | 16px all sides               | Shared TDesign adapter                                                                      |
| Dialog content | 12px vertical                | `--idea-dialog-content-padding-block`; shared adapter, or tab content when it owns the body |

- Exactly one layer owns each inset; avoid nested padding across surface, header,
  content, and footer. Keep row/control padding and gaps separate. Menu hover and
  selection backgrounds span the width. Suggestions, tooltips, input assists, and
  compact floating toolbars retain their own density.
- Input prefix/suffix icons use the control's icon slots directly, without a Button
  wrapper. Keep only the interaction needed by the action; the input owns spacing.
- `InputNumber`: use `theme="column"` and
  `idea-input-number--persistent-controls`. Wrap in a labelled group, not a native
  label that forwards events to its buttons. Compact number-format fields use
  content-sized labels with an 8px control gap.
- Ribbon/status icon buttons use `--idea-icon-button-hover-bg`; keep foreground
  color stable on hover.

## Ribbon and menus

- Action icons use two sizes, owned by the shared controls: compact ribbon actions
  and menu icons use `--idea-action-icon-size` (15px); tall actions use
  `--idea-ribbon-large-icon-size` (18px). `--idea-menu-icon-size` aliases the compact
  size. Form-control indicators keep their separate `--idea-control-icon-size` token.
  Lucide action icons use
  `--idea-icon-stroke-width` (2). Do not set size/stroke props in feature action slots.
  Composite icon containers inherit the slot size; border previews retain their
  semantic line weights. Dropdown indicators and dialog launchers keep their
  separate shared auxiliary sizes.

- All toolbar tabs compose their concrete feature groups inside `RibbonToolbar`.
  It owns the viewport, rail, overflow scrolling, and focus visibility; do not
  recreate those containers in feature toolbars. Use `ribbon.columns` or
  `ribbon.compact` for group shells, `ribbon.stack`/`ribbon.two-rows` for action
  columns, and `ribbon.row` for compact rows. Keep only feature-specific column
  widths and horizontal arrangements local.
- Tall actions and stacked compact actions share a 54px height (two 26px rows
  with a 2px gap). Tall action icons and labels occupy those same two rows;
  derive dimensions from the shared `--idea-ribbon-*` tokens rather than adding
  local height or row-gap values.

- In `shared/ribbon`, use `RibbonButton` for actions/pressed states,
  `RibbonMenuButton` for popup triggers, and `RibbonSplitButton` for action + popup.
  Compact/tall are variants. Font selectors use TDesign Select and the adapter.
- Controls own icons, text, arrows, focus, and disabled states; groups own spacing
  and columns. Use `fullWidth` to fill a slot; do not forward parent scoped classes
  through component roots for positioning.
- Keep each tool concrete and explicitly composed in Vue. Grouped tools keep their
  trigger and teleported popup under one local root; forward keyboard/ARIA attributes
  to the interactive element.
- List menus use `useMenu` + `MenuSurface` for opening, keyboard navigation,
  dismissal, and focus restoration across ribbon, status bar, and Sheet. Form panels
  and cascading submenus retain domain-specific focus/state rules.
- First- and second-level text menus size to their content. Avoid fixed widths or
  minimum widths that add empty space; reserve explicit widths for input controls,
  searchable value lists, and compact preset grids.
- Use `MenuItem` for commands and `MenuRadioItem` for single choices; features supply
  checked state, labels, and actions. Menu padding, row height, indicators, radii,
  and shadows stay shared; consumers set only width, height limits, stacking, and placement.
