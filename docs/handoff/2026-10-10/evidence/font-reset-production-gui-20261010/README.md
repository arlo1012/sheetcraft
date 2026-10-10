# Production default/reset font-color acceptance

Result: **PASS for the bounded approved rule**, in native WPS and Excel for the web on the dot cloud computer. One frozen public-Core production file was used, sequentially in both apps. No repair warning appeared.

## Verified behavior
- Dark opening: A1 Default13, B1 Size18, and F1 Reset20242c inherited white/bold. C1 literal black and D1 live dark1 were dark against black. E1 remained red.
- A genuine named Light style was chosen once per app: WPS `TableStylePreset1_Accent1`; Excel Ice Blue `TableStyleLight2`. A/B/F became blue/bold. C remained literal black, D live dark1, E red.
- Each app saved its own acceptance copy; the document/tab was fully closed and the exact saved file was freshly reopened. The intended colors, sizes, and harmless A9 marker edit persisted.
- B1 and ordinary B6 retained18pt. F1 retained13pt. WPS ordinary A6 native More Colors showed HEX20242C/RGB32,36,44; both inspection dialogs were canceled. Actual saved XLSX bytes in both apps retain all matching ordinary-row fixed RGB/theme intents and13/18 sizes.
- Every cell value is unchanged except the intended A9 suffix. Normal11 remains11; no column-width/font workaround or global setting change occurred.

## Actual artifacts
- wps-app-saved.xlsx: 9792 bytes, SHA25606c409c2e21d1a5ce37b111f19fa403b3e2127e8e2d42be17ae871f761bfe3db
- excel-app-saved.xlsx: 7202 bytes, SHA256405dd4acb51fb1ab8be9bd3443617c17e341f4c3d6609ef5acff4385f0f6b4bf
- ooxml-proof.json / assertions.json: actual saved fonts, styles, table styles, cell values, clean CRC/XML, immutable-input checks
- observations.json: UI stages, instrumentation qualifications, cleanup
- screenshot-manifest.json / evidence/:13 actual JPEG screenshots, nonblank pixel checks, safe worksheet/ribbon crops
- safe-hosted-identity.json: opaque component SHA256 only; same exact saved workbook on reopen

Excel saved bytes came from the supported top-level OneDrive My Files exact-owned-row Download, with a download event registered before clicking. No private URL, token, profile extraction, or chrome://downloads route was used. Saved Office metadata stays unaltered in XLSX bytes, and account names are excluded from reports.

## Qualifications and cleanup
Task-local copies initially inherited read-only permissions, which were corrected before editing. One WPS focus miss was immediately undone; saved-package value assertions prove the restore. One Excel setValue-only attempt did not change the marker; actual supported keystrokes subsequently committed it. These are input-tool qualifications, not product failures.

All new WPS test documents and browser tabs53–56 were safely closed. Only protected browser tabs2/5/8/9 and the existing starred WPS protection-print-calculation document remain. They were left untouched. WPS iteration, app preferences, LibreOffice, production source, commits and pushes were outside this case. GUI released.

This result covers the six-header/default-reset rule and matching plain controls in this one production file. It is not broader attribute-matrix or blanket compatibility certification.
