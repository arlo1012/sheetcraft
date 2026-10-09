# Formula and Excel compatibility catalogs

These files are the reviewable scope baseline for the Formula/Excel work. They
are inventories, not implementation claims and not a substitute for oracle
workbooks or compatibility tests.

- `function-inventory.json` is a 2026-09-05 snapshot of the Microsoft
  alphabetical catalog: 521 unique normalized function identifiers. It keeps
  the Microsoft category and the individual Microsoft documentation URL for
  every function. The source page has one presentation typo, `BETA.INVn`; the
  catalog normalizes that single entry to `BETA.INV` and the updater documents
  the normalization.
- `feature-inventory.json` records the non-function surface: grammar,
  references, names, tables, arrays, value/date/error semantics, calculation,
  history, X1-X3 exchange capabilities, and external/platform boundaries.

Every entry carries the same six directions: `read`, `render`, `edit`,
`recalc`, `write`, and `roundtrip`. Status is deliberately conservative:
`planned`, `limited`, `verified`, `preserve`, `blocked`, or `n/a`. `verified`
requires the declared compatibility profile and regression evidence; no entry
in this initial catalog makes an Excel-compatibility claim. Existing basic
formula/reference behavior is marked `limited` where applicable, not
`verified`.

Both catalogs record a top-level `capturedAt` and a source-level `capturedAt`.
The latter identifies when the source provenance was observed, rather than when
a project-only status was subsequently reviewed.

`scope` makes the execution boundary explicit:

```text
local     Targeted for deterministic local calculation.
external  Requires an explicit data/link/service resolver; no implicit access.
platform  Depends on a platform, add-in, macro, or automation capability.
review    Needs a separate compatibility/product decision before a promise.
```

The Microsoft [alphabetical catalog](https://support.microsoft.com/en-us/excel/excel-functions-alphabetical)
is the function enumeration source; its [category catalog](https://support.microsoft.com/en-us/excel/excel-functions-by-category)
is retained as a reconciliation source. The project must not infer a completed
inventory from a calculation engine's exports, including Core's own function registry.

## Validation and controlled refresh

Validation is offline and uses Node 24 only:

```sh
node scripts/compatibility/catalog/validate.mjs
node --test scripts/compatibility/catalog/catalog.test.mjs
```

It checks schema versions, captured timestamps, source URLs, unique function
names/feature IDs, required scopes, and complete six-direction statuses. It
does not fetch the network. Root `bun run check:compatibility` runs both checks,
and `bun run ci` includes that offline gate. The
[first-party regression lab](../../tools/compatibility-lab/README.md) remains a
separate development command. It consumes public Core/XLSX package outputs and
the root workspace lockfile, but is not imported by product runtime. Its
synthetic formula and OOXML probes do not promote catalog entries to `verified`.

The updater is a deliberate review action, not CI behavior:

```sh
node scripts/compatibility/catalog/update-functions.mjs --write
node scripts/compatibility/catalog/validate.mjs
```

It fetches the current Microsoft alphabetical page, expands grouped labels
such as `FIND, FINDB`, rejects conflicting duplicate entries and suspiciously
small snapshots, then rewrites only `function-inventory.json`. Existing
project-reviewed `scope` and six-direction `statuses` are retained by function
name; the command reports additions and removals for review. Review the
resulting diff, update `feature-inventory.json` when Microsoft changes the
surface, and attach oracle fixtures before promoting any status to `verified`.
