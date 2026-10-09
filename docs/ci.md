# Quality Checks

Run the shared verification gate locally from the workspace root:

```bash
bun install --frozen-lockfile
bun run ci
```

Use the Bun version declared by `packageManager` in the root `package.json`.
No hosted CI workflow is currently configured in this repository.

## Checks

`bun run ci` runs formatting, lint, strict types, all package and Web unit tests,
architecture boundaries, public package imports, the Worker consumer smoke,
and production bundle budgets. The Worker smoke builds for a browser target
and executes the bundle in Bun's Worker runtime. It is not a browser end-to-end
test.

High-risk visible interaction changes also need browser verification as
described in [the development guide](development.md). Routine feature work
starts with the owning module's checks; the full CI gate remains the shared
integration check.
