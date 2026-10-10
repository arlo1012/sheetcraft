# Native iterative workbook Excel control

Result: PASS for this single native-producer control. In Excel web, changing B3 to `=(B3+2)/2` genuinely converged to 1.999938965, with saved status. Full close and a new-tab reopen of the same hosted item rendered 1.999969482 and retained the exact formula and saved status.

- Source and owned upload copy are unchanged, 9,043 bytes, SHA-256 `31bf0302c4ee3939d95f93ef85ea28295b1bb992f7e879a22bd6d248ca3ee47e`.
- Original native input has only B3: `(B3+1)/2`, formula `ca=1`, cached 0.999969482421875; workbook `iterate=1`, `iterateCount=50`, `iterateDelta=0.0001`.
- `excel-actual-saved.xlsx` is the real 7,413-byte OneDrive My Files context-menu download. SHA-256 `2864293e96e1a22a72fb7ea009e46724be9d24f631d81dbd4261d1ffcbfbc5aa`.
- Saved B3 formula `(B3+2)/2`, `ca=1`, cached 1.99993896484375. Calculation properties retain iteration/count/delta and include `calcCompleted=0`. Producer metadata: Microsoft Excel Online, AppVersion 16.0300.
- Three real cropped nonblank JPEGs show imported near1, edited near2 plus saved indicator, and fresh reopened near2. Crops exclude account and address UI.
- Safe hosted identity is an opaque document-component SHA-256 only. Same identity was verified across full close/new-tab reopen.
- Temporary normal-UI entry hiccups in B3 were corrected before the final exact formula was committed. Details are in `observations.json`.
- No app/account preferences, original WPS workbook, unrelated hosted files, cached values, repository code or GitHub state were changed. Finished owned tabs 57, 58 and 59 were closed; protected tabs 2, 5, 8 and 9 remain.

This validates a genuine native WPS-produced input and native Excel iterative computation/persistence. It does not validate the current production writer or prove that formula `ca=1` or a legal cyclic cache alone is sufficient. Further code diagnosis is separate.
