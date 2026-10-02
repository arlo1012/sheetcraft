# Color and custom column filters

The column filter panel has Content and By color tabs. The color tab lists solid
background and font colors from the data cells, including duplicate highlights
and conditional formatting. Header colors are excluded. No fill is a separate
background choice; gradient fills are not solid-color choices. A selected color
remains a draft until Apply.

The numeric filter menu provides comparisons, Between, Top N, Above average,
Below average, and Custom filter. Comparisons open a two-row dialog with editable
value suggestions and And/Or. Between initializes inclusive lower and upper
conditions. Cancel returns to the panel without changing its search or selection.
The current numeric condition remains active until a different condition or
content selection is confirmed.

Top N supports Top/Bottom items or percentages. Item counts are integers from
1 through 500; percentages are finite values greater than 0 and at most 100.
The cutoff includes ties and is calculated from the complete numeric column,
independently of other column filters. Average filters use the same complete
numeric column. Criteria from different columns combine with And.

Custom text conditions are case-insensitive. `?` matches one character, `*`
matches any number of characters, and `~` escapes a wildcard. Value-list
selections retain their exact typed keys. Date conditions use the workbook's
date system.

Conditions pass through Core commands and support undo/redo, native snapshots,
and standard XLSX AutoFilter metadata. Color filters reference differential
styles allocated after conditional-format styles. Clear filter removes only the
current column's criteria.
