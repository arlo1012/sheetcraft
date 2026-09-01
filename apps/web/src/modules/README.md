# Feature Modules

Create one directory per product capability. A module owns its Vue components,
state, commands, tests, and module-specific styles.

Tool surfaces must import concrete Vue components explicitly. Do not add a
TypeScript schema or generic dynamic renderer to assemble a module's UI.

Move code into `shared/` only after at least two modules need the same stable
contract or primitive.
