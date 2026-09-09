# Web UI Standards

## Typography

Use four typography levels for Web interface text. Sizes are CSS pixels at
100% scale; font size and line height are a pair.

| Role                | Size / line height | Weight | Uses                                                                                                                                                      |
| ------------------- | ------------------ | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supporting text     | 12px / 18px        | 400    | Status bar, zoom readout, shortcuts, descriptions, tooltips, ribbon group captions, row/column headers                                                    |
| Main interface text | 13px / 20px        | 400    | Ribbon actions and tabs, form labels and controls, checkbox/radio labels, menu and select options, dialog tabs, Sheet tabs, formula/address/search inputs |
| Section heading     | 14px / 22px        | 600    | Panel and popover titles                                                                                                                                  |
| Dialog heading      | 16px / 24px        | 600    | Dialog titles                                                                                                                                             |

- The default Web interface typography is 13px / 20px. Keep font family tied
  to `--idea-font-sans` for both native elements and TDesign components.
- Use 500 weight for selected navigation and small group headings. Hover,
  focus, disabled, and selected states keep the same font size and line height.
- Ordinary numeric format samples may use 14px / 22px at weight 400.
  Previews of actual cell typography must use the document's font settings.
- Reuse product typography tokens as the single source of sizes and line
  heights; map TDesign typography through the shared adapter. Components
  choose a role instead of adding local pixel values or another density scale.
- Control height and text line height are separate. The default 28px control
  uses 13px / 20px text; accommodate that text in the container instead of
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
- Select suggestions, tooltips, dialogs, input assists, and compact floating
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
