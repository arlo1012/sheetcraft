# XLSX browser bundle: third-party record

`@idea10/xlsx-io` imports the published `exceljs/dist/exceljs.min.js` browser
UMD entry from `exceljs@4.4.0`; it does not import ExcelJS's Node entry. The
release package identifies that entry as its browser field and identifies
ExcelJS as MIT-licensed. ExcelJS's own v4.4.0 build configuration makes the
browser bundle with Browserify and Terser, and writes the source map alongside
the minified UMD.

The distributable notice material is checked into Web public assets so Vite
copies it unchanged to a production build:

- `apps/web/public/third-party/xlsx/NOTICE.txt`
- `apps/web/public/third-party/xlsx/bundle-sbom.json`

Deployments that serve the XLSX feature must retain those files at
`/third-party/xlsx/`; they describe the exact reviewed browser input, not a
generic dependency tree.

## Reviewed artifact

| Field                                     | Value                                                              |
| ----------------------------------------- | ------------------------------------------------------------------ |
| package                                   | `exceljs@4.4.0`                                                    |
| entry                                     | `exceljs/dist/exceljs.min.js`                                      |
| UMD SHA-256                               | `7e49da68588e250dbb8bba190d2caa8ab3787cc0284bda1d8b2f805c4df742c9` |
| UMD byte length                           | `947702`                                                           |
| source-map SHA-256                        | `b65fb09908a8e2a3aaa6c751465c1662fc11fdfd59ae970b8b2d544fc18f6ac7` |
| source-map byte length                    | `3249905`                                                          |
| source records / embedded source contents | `534 / 534`                                                        |

The checked-in SBOM is a bounded, artifact-level inventory: its components are
the package groups named by the UMD source map, and its `sourceRecords` count
is the count of source-map paths in each group. It is not an assertion that
the current workspace installation, lockfile, or a package registry resolves
to the versions used to build this October 2023 UMD. In particular, the
installed `dayjs@1.11.23` is **not** evidence that the prebuilt UMD embeds that
version; the embedded Day.js source has no version marker. The same rule is
used for every component marked `UNKNOWN` or `NOASSERTION` in the SBOM.

Four components have artifact-level provenance sufficient for a versioned
notice: ExcelJS is the reviewed release package (`4.4.0`); the embedded JSZip
source banner states `v3.10.1`; the embedded `core-js` versions record states
`3.33.0`; and an embedded `elliptic/package.json` states `6.5.4`. JSZip is
MIT-or-GPL-3.0-or-later and this distribution elects its MIT option. The JSZip
banner also identifies bundled pako as MIT-licensed, but does not identify its
version; the pako version remains `UNKNOWN` in the SBOM.

The source map establishes that the remaining named groups are embedded, but
does not carry their package manifests. `NOTICE.txt` therefore maps their
license families from the projects' public registry metadata and embedded
license headers while leaving their UMD build versions `UNKNOWN`. It includes
the MIT, ISC, and BSD-3-Clause texts that cover the mapped groups. No installed
package version is used as a build-version claim. The ExcelJS v4.4.0 release
tree contains no npm, Yarn, or pnpm lockfile, so exact release-build transitive
versions cannot be reconstructed from that release. This remains a release
provenance gap, not a reason to claim complete legal clearance.

Import uses bounded central-directory plus actual-inflation preflight. Export
also imports the tree-shakeable `fflate/browser` ESM entry from `fflate@0.8.3`
to finalize only the freshly generated archive with native cell-image parts
and canonical drawing/font declarations. This does not replace or bypass the
import gate. Its separately installed, pinned MIT package and license are
recorded in `NOTICE.txt`; it is not part of the historical ExcelJS UMD SBOM.

Primary sources: [ExcelJS v4.4.0 package manifest](https://raw.githubusercontent.com/exceljs/exceljs/v4.4.0/package.json), [ExcelJS v4.4.0 build configuration](https://raw.githubusercontent.com/exceljs/exceljs/v4.4.0/gruntfile.js), [ExcelJS v4.4.0 license](https://raw.githubusercontent.com/exceljs/exceljs/v4.4.0/LICENSE), [pako MIT license](https://raw.githubusercontent.com/nodeca/pako/1.0.11/LICENSE), the public npm registry metadata used for the SBOM license-family lookup, and the reviewed package's UMD plus source map recorded above.
