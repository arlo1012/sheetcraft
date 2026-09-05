# Continuous Integration

The repository uses Gitea Actions. The workflow in
[`.gitea/workflows/ci.yml`](../.gitea/workflows/ci.yml) runs on pushes and pull
requests, installs the committed lockfile, and executes the same `bun run ci`
command used locally. A failed step fails the job; CI does not deploy or push
changes.

## Runner Requirements

The Gitea repository must have Actions enabled and an available runner carrying
the `ubuntu-latest` label. The runner and its job container must be able to reach
the Gitea instance, GitHub for the explicitly addressed setup actions, Node.js
and Bun downloads, and the npm registry. See the official
[Gitea Actions setup guide](https://docs.gitea.com/usage/actions/quickstart/).

The workflow pins Node.js to `24.13.0` and Bun to `1.3.11`. Keep its Bun version
aligned with `packageManager` in the root `package.json`. It uses the official
[Bun setup action](https://bun.com/guides/runtime/cicd) and does not require a
personal access token or repository secret for a normal checkout.

After the workflow is pushed, verify that the **Quality gates** job actually
runs on the intended runner. Register the successful status reported by that
run in branch protection if merges should require it. Workflow files alone cannot enable
repository Actions, register a runner, or configure branch protection; those
settings belong to the Gitea instance and repository administration.

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
