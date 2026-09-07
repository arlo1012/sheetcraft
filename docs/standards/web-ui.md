# Web UI Standards

- Tool popovers and action menus use **8px on all four sides**, measured from
  the inside of the border to their content or interactive rows. Use
  `--idea-tool-panel-padding`, mapped to `--idea-space-4`.
- Apply this rule to color palettes, custom colors, borders, alignment, and
  command/context menus. Select suggestions, tooltips, dialogs, input assists,
  and compact floating toolbars keep their own component density.
- Exactly one layer owns the inset: the surface or its embedded content.
  Coordinate header, content, and footer insets; do not add nested padding.
- Menu-item padding, control padding, and gaps are separate from the surface
  inset. Preserve text alignment and usable content width when adjusting them.
- Reuse existing surfaces and shared tokens. For embedded TDesign controls,
  prefer public props and local theme variables; preserve component defaults
  when forwarding nested configuration. Keep necessary adaptations in the
  shared TDesign adapter, not feature-level `.t-*` overrides.
