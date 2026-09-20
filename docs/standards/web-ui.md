# Web UI Standards

## Component reuse and visual consistency

- Before implementing or changing UI, find the closest existing product UI and
  inspect its components and styles. State which existing implementations will
  be reused in the implementation update; routine reuse does not require approval.
  A user-provided reference takes priority over independently chosen styling.
- Choose in this order: an existing project component that fits the interaction,
  a TDesign component through its public API, then a new component only for a
  confirmed gap. Do not create native replacements or one-to-one wrappers for
  controls already covered by those implementations.
- Reuse the implementation, not just its appearance. Share components or SCSS
  primitives when the same contract occurs in multiple features; keep business
  state and actions in their owning modules. Do not copy feature CSS or import
  another feature's private components to reproduce its look.
- Use these existing references for recurring patterns:
  - Option lists: the number categories and date types in `CellFormatDialog`,
    backed by `shared/option-list/OptionList.vue` and its shared SCSS primitives.
  - Searchable menus: `WorkbookSheetNavigator`, `shared/menu/MenuSearch.vue`,
    and the shared menu surface and items.
  - Form controls and dialog actions: TDesign inputs and the default Dialog
    buttons used by `CellFormatDialog`. Preserve their size, spacing, themes,
    and cancel-before-confirm order, including when an extra action requires
    a custom footer.
- Feature styles own layout, placement, and necessary size limits. Shared
  components own control padding, typography, borders, radii, shadows, scrollbars,
  and hover, focus, selected, and disabled states. Extend the shared contract for
  a real repeated need instead of overriding its internals in a feature.
- Before committing, review new markup and style declarations against the chosen
  reference. Remove duplicated controls, undefined tokens, and unexplained visual
  differences. Functionality and passing static checks alone do not establish
  visual consistency. Follow the repository's scoped verification policy; this
  review does not require broad tests or browser checks for every small change.

## Typography

Use four typography levels for Web interface text. Sizes are CSS pixels at
100% scale; font size and line height are a pair.

| Role                | Size / line height | Weight | Uses                                                                                                                                                      |
| ------------------- | ------------------ | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supporting text     | 12px / 18px        | 400    | Status bar, zoom readout, shortcuts, descriptions, tooltips, ribbon group captions, row/column headers                                                    |
| Main interface text | 12px / 20px        | 400    | Ribbon actions and tabs, form labels and controls, checkbox/radio labels, menu and select options, dialog tabs, Sheet tabs, formula/address/search inputs |
| Section heading     | 14px / 22px        | 600    | Panel and popover titles                                                                                                                                  |
| Dialog heading      | 16px / 24px        | 600    | Dialog titles                                                                                                                                             |

- The default Web interface typography is 12px / 20px. Keep font family tied
  to `--idea-font-sans` for both native elements and TDesign components.
- Use 500 weight for selected navigation and small group headings. Hover,
  focus, disabled, and selected states keep the same font size and line height.
- Ordinary numeric format samples may use 14px / 22px at weight 400.
  Previews of actual cell typography must use the document's font settings.
- Reuse product typography tokens as the single source of sizes and line
  heights; map TDesign typography through the shared adapter. Components
  choose a role instead of adding local pixel values or another density scale.
- Control height and text line height are separate. The default 28px control
  uses 12px / 20px text; accommodate that text in the container instead of
  shrinking labels to fit. Keep icon sizes independent from text roles,
  including TDesign icons that consume typography variables.
- This standard covers the editing interface, including the formula bar.
  Cell content, in-cell editors, document font defaults, row-height measurement,
  and document export remain owned by the workbook model. Row/column header
  text continues to follow the Sheet viewport's existing zoom behavior.
- Do not introduce 11px interface copy. Symbol glyphs such as `fx` and the
  insertion `+`, and existing narrow-cell image placeholders, have their own
  rendering constraints and are not additional general typography levels.

## Spacing and component integration

- Content panels (color palettes, custom colors, border configuration, line-style grids) use
  **8px on all four sides**, measured from the inside of the border to content.
  Use `--idea-tool-panel-padding`.
- List menus (statistics, alignment, commands, right-click menus)
  use **8px vertically and 0 horizontally**, via `--idea-menu-padding`. Rows own
  text/icon insets; hover and selection backgrounds span the menu width.
- Dialogs use **16px outer padding on all four sides**, mapped in the shared
  TDesign adapter. Content groups own their internal spacing.
- Select suggestions, tooltips, input assists, and compact floating
  toolbars keep their own component density.
- TDesign `InputNumber` uses `theme="column"` and
  `idea-input-number--persistent-controls` for visible right-side controls.
  Use a labelled group around this composite control instead of a native
  wrapping label, which can forward clicks and hover to its decrease button.
  Compact number-format fields use content-sized labels with an 8px control gap.
- Exactly one layer owns the inset: the surface or its embedded content.
  Coordinate header, content, and footer insets; do not add nested padding.
- Menu-item padding, control padding, and gaps are separate from the surface
  inset. Preserve text alignment and usable content width when adjusting them.
- Reuse existing surfaces and shared tokens. For embedded TDesign controls,
  prefer public props and local theme variables; preserve component defaults
  when forwarding nested configuration. Keep necessary adaptations in the
  shared TDesign adapter, not feature-level `.t-*` overrides.
- Icon-button hover feedback uses `--idea-icon-button-hover-bg` across ribbon
  and status-bar controls. Keep the icon's foreground color stable on hover.

## Ribbon controls

- Reuse the controls in `apps/web/src/shared/ribbon` across toolbar modules:
  `RibbonButton` for actions and pressed states, `RibbonMenuButton` for a single
  popup trigger, and `RibbonSplitButton` for an action with a separate popup
  trigger. Compact and tall layouts are presentation variants of these controls.
- Controls own their icon, text, arrow, focus, and disabled presentation. Groups
  own spacing and column widths through their own DOM containers. Use
  `fullWidth` when a control fills a layout slot; do not position a nested tool
  by forwarding a parent's scoped class through multiple component roots.
- Keep a tool's trigger and teleported popup under one local root when the tool
  participates in group layout. Forward trigger attributes deliberately so
  keyboard and accessibility attributes remain on the interactive element.
- Use `shared/menu/useMenu` with `MenuSurface` for list-menu opening,
  keyboard entry, dismissal, and focus restoration. This applies to ribbon,
  status-bar, and in-sheet menus. Form panels and cascading submenus retain
  their domain-specific focus and state rules.
- Use `MenuItem` for commands and `MenuRadioItem` for single-choice options.
  `MenuRadioItem` owns the TDesign radio indicator and menu keyboard semantics;
  feature components supply `checked`, labels, and actions.
- Keep list-menu padding, row height, indicator styling, corner radius, and
  shadow in the shared menu components. Consumers may set menu width, height
  limits, stacking, and placement; do not restyle the shared menu internals.
- Keep each business tool concrete and compose it explicitly in Vue templates.
  Font selectors continue to use TDesign's public Select API and the shared
  adapter styles.
