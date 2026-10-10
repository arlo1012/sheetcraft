# Font intent diagnosis and product choices

Historical diagnosis, 2026-10-10 UTC, at production `5a7f2fa`. The observations
below describe the previous strict literal-color contract. The user subsequently
selected choice 1 (follow target-app default/reset behavior). Production
`90279cf` implements the [revised direct-color contract](font-color-default-reset-20261010.md)
and aligns Normal with Core's fixed default; fresh app acceptance is separate.
The earlier candidate rejection and original evidence remain unchanged.

## 1 Ordinary default color mismatch

Core's ordinary fallback is fixed `#20242c`; exported Normal and default-derived fonts currently contain fixed `FF000000`. This is a separate projection mismatch. Changing Core dark1 to `#123456` leaves the fallback and literal RGB unchanged; only explicit `textColorTheme` follows. Explicit `#20242c` remains direct style and overrides table white in Core. Therefore replacing fixed colors with Theme1 changes the existing contract even when today's colors look similar.

## 2 Live table inheritance already works

WPS's independently authored dark, Clear/None and genuine named-Light saves use Normal Calibri 11 with `color theme="1"`. B1's size-only 13-point font differs only in `sz`; C1's explicit red is `rgb="FFFF0000"`. The dark style is `TableStylePreset3_Accent1`; Clear/None has no `tableStyleInfo.name`; genuine Light is `TableStylePreset1_Accent1`. Default and size-only colors follow white, unstyled black and Light blue respectively; red remains direct. Clear/None must not be described as named Light.

The producer-derived Normal-clone repair preserves size without freezing table color or boldness. Production default 13-point and size-only 18-point controls follow dark-to-named-Light changes and save/full-close/fresh-reopen in WPS and Excel web. Excel's native size-only observations support the same inheritance behavior, but its saved bytes were not acquired.

## 3 Equal-to-Normal literal override remains ambiguous

In the imported producer environment, Normal is fixed `rgb="FF000000"`. Production C1 stores a distinct sparse literal-black font, yet both apps display inherited white on dark; WPS follows blue on named Light. Explicit Theme1 black and RGB red work. The WPS production save retains C1's separate font record, with the same saved properties as the default 13-point font, without restoring the intended override.

Two WPS UI operations distinguish different intentions in this RGB-Normal environment:

- Palette Black, selected separately from Automatic in the Normal-size-only candidate, saves C1 as `theme="1"`; it stays black against Light blue. This successful theme override is not proof of a fixed-RGB carrier or indexed0 behavior. Excel's Text1 palette operation selectively overrides the dark header, but no saved OOXML was acquired.
- More Colors → Custom → RGB/HEX 000000 in the production copy still follows blue. Its actual save merges C1 into the default 13-point font and XF. This bounded native result must not be generalized to all WPS or Excel workbooks, especially independently authored Theme1-Normal files.

## 4 Moving Normal moves the defect

One isolated candidate changes only Normal and default-derived 13/18-point fonts from `FF000000` to `FF20242C`; explicit fonts remain unchanged. WPS baseline F1 is dark literal `#20242c`, confirmed by native HEX 20242C and RGB 32/36/44. Candidate C1 becomes dark, but F1 becomes inherited white. The same-Normal problem shifts to another genuinely explicit color.

The candidate was rejected on initial open before style edits, save/reopen or Excel testing. Separately, the unchanged reader materializes its implicit colors because the narrow own-producer guard recognizes only the old black base. No production implementation followed.

## 5 Product choices

1. Adopt target-app default/reset meaning when an explicit color equals Normal. This collapses distinct literal and reset intents and changes Core behavior; it requires a user decision and an explicit revised contract.
2. Retain strict fixed-literal and distinct-reset semantics, preserve live table inheritance, and keep this compatibility constraint open until a richer carrier is proven in both apps and roundtrip.

Carrier or snapshot alternatives remain unvalidated and could alter external editing semantics. Freezing table fonts would sacrifice the requested live inheritance. Existing evidence does not prove that OOXML cannot represent the intent.

## Evidence and color references

See [the application checkpoint](app-checkpoint-20261010.md) and retained evidence directories `app-authored-table-fonts-20261010`, `table-header-normal-size-only-gui-20261010`, `table-header-production-gui-20261010`, `core-default-color-base-control-20261010` and `core-default-color-base-gui-20261010`.

[Microsoft color attributes](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.spreadsheet.color?view=openxml-3.0.1) distinguish RGB, theme and indexed references. [Microsoft indexedColors](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.spreadsheet.indexedcolors?view=openxml-3.0.1) defines indexed0 as default-palette black, changeable through a custom palette; the exporter writes no custom palette. These references establish representation semantics, not the empirical app behavior above.
