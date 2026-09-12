import { createFormulaError, isFormulaError, type FormulaValue } from "./types.js";

export type IterativeCalculationOptions = Readonly<{
  /** Dependencies point from a formula cell to the formula cells it reads. */
  dependencies: ReadonlyMap<string, ReadonlySet<string>>;
  /** Supplies literal, acyclic, and prior calculated values outside an active component. */
  initialValue: (key: string) => FormulaValue;
  /** Evaluates one formula using the values visible during the current calculation pass. */
  evaluate: (key: string, read: (key: string) => FormulaValue) => FormulaValue;
  maxIterations: number;
  maxChange: number;
}>;

type Component = readonly string[];

/**
 * Calculates only strongly connected formula components.
 *
 * Components are processed after the components they depend on.  Within one
 * component this uses Gauss-Seidel iteration: a cell written earlier in a pass
 * is visible to later cells in that same pass.  This makes the result stable
 * for a deterministic dependency-map insertion order while avoiding a second
 * value map for every iteration.
 */
export function calculateIterativeComponents(options: IterativeCalculationOptions): Map<string, FormulaValue> {
  validateOptions(options);

  const nodes = [...options.dependencies.keys()];
  const nodeSet = new Set(nodes);
  const forward = new Map<string, readonly string[]>();
  const reverse = new Map<string, string[]>();
  for (const key of nodes) reverse.set(key, []);
  for (const key of nodes) {
    const edges = [...(options.dependencies.get(key) ?? [])].filter((dependency) => nodeSet.has(dependency));
    forward.set(key, edges);
    for (const dependency of edges) reverse.get(dependency)?.push(key);
  }

  const components = stronglyConnectedComponents(nodes, forward, reverse);
  const componentForKey = new Map<string, number>();
  components.forEach((component, index) => {
    for (const key of component) componentForKey.set(key, index);
  });

  const componentDependencies = components.map(() => new Set<number>());
  components.forEach((component, componentIndex) => {
    for (const key of component) {
      for (const dependency of forward.get(key) ?? []) {
        const dependencyComponent = componentForKey.get(dependency);
        if (dependencyComponent !== undefined && dependencyComponent !== componentIndex) {
          componentDependencies[componentIndex]!.add(dependencyComponent);
        }
      }
    }
  });

  const result = new Map<string, FormulaValue>();
  for (const componentIndex of dependencyFirstOrder(componentDependencies)) {
    const component = components[componentIndex]!;
    if (!isCyclicComponent(component, forward)) continue;
    const values = new Map<string, FormulaValue>();
    for (const key of component) values.set(key, initialIterationValue(options.initialValue(key)));

    for (let iteration = 0; iteration < options.maxIterations; iteration += 1) {
      let converged = true;
      for (const key of component) {
        const previous = values.get(key) as FormulaValue;
        const next = normalizeValue(options.evaluate(key, (dependency) => {
          if (values.has(dependency)) return values.get(dependency) as FormulaValue;
          if (result.has(dependency)) return result.get(dependency) as FormulaValue;
          return normalizeValue(options.initialValue(dependency));
        }));
        values.set(key, next);
        if (!hasConverged(previous, next, options.maxChange)) converged = false;
      }
      if (converged) break;
    }
    for (const [key, value] of values) result.set(key, value);
  }
  return result;
}

function validateOptions({ maxIterations, maxChange }: IterativeCalculationOptions): void {
  if (!Number.isInteger(maxIterations) || maxIterations < 1) {
    throw new RangeError("maxIterations must be a positive integer.");
  }
  if (!Number.isFinite(maxChange) || maxChange < 0) {
    throw new RangeError("maxChange must be a finite non-negative number.");
  }
}

function initialIterationValue(value: FormulaValue): FormulaValue {
  if (value === null || isFormulaError(value)) return 0;
  return normalizeValue(value);
}

function normalizeValue(value: FormulaValue): FormulaValue {
  return typeof value === "number" && !Number.isFinite(value) ? createFormulaError("NUM") : value;
}

function hasConverged(previous: FormulaValue, next: FormulaValue, maxChange: number): boolean {
  if (typeof previous === "number" && typeof next === "number") {
    return Math.abs(previous - next) <= maxChange;
  }
  if (isFormulaError(previous) && isFormulaError(next)) return previous.code === next.code;
  return Object.is(previous, next);
}

function isCyclicComponent(component: Component, forward: ReadonlyMap<string, readonly string[]>): boolean {
  const onlyKey = component[0]!;
  return component.length > 1 || (forward.get(onlyKey) ?? []).includes(onlyKey);
}

/** Iterative Kosaraju traversal so malformed/deep dependency chains cannot overflow the call stack. */
function stronglyConnectedComponents(
  nodes: readonly string[],
  forward: ReadonlyMap<string, readonly string[]>,
  reverse: ReadonlyMap<string, readonly string[]>,
): Component[] {
  const visited = new Set<string>();
  const finished: string[] = [];
  for (const start of nodes) {
    if (visited.has(start)) continue;
    visited.add(start);
    const stack: Array<{ key: string; edgeIndex: number }> = [{ key: start, edgeIndex: 0 }];
    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      const edges = forward.get(frame.key) ?? [];
      if (frame.edgeIndex < edges.length) {
        const dependency = edges[frame.edgeIndex++]!;
        if (!visited.has(dependency)) {
          visited.add(dependency);
          stack.push({ key: dependency, edgeIndex: 0 });
        }
        continue;
      }
      finished.push(frame.key);
      stack.pop();
    }
  }

  const assigned = new Set<string>();
  const components: string[][] = [];
  for (let index = finished.length - 1; index >= 0; index -= 1) {
    const start = finished[index]!;
    if (assigned.has(start)) continue;
    assigned.add(start);
    const component: string[] = [];
    const stack = [start];
    while (stack.length > 0) {
      const key = stack.pop() as string;
      component.push(key);
      for (const dependent of reverse.get(key) ?? []) {
        if (!assigned.has(dependent)) {
          assigned.add(dependent);
          stack.push(dependent);
        }
      }
    }
    components.push(component);
  }
  return components;
}

function dependencyFirstOrder(dependencies: readonly ReadonlySet<number>[]): number[] {
  const visited = new Set<number>();
  const order: number[] = [];
  for (let start = 0; start < dependencies.length; start += 1) {
    if (visited.has(start)) continue;
    visited.add(start);
    const stack: Array<{ index: number; dependencies: number[]; cursor: number }> = [
      { index: start, dependencies: [...dependencies[start]!], cursor: 0 },
    ];
    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      if (frame.cursor < frame.dependencies.length) {
        const dependency = frame.dependencies[frame.cursor++]!;
        if (!visited.has(dependency)) {
          visited.add(dependency);
          stack.push({ index: dependency, dependencies: [...dependencies[dependency]!], cursor: 0 });
        }
        continue;
      }
      order.push(frame.index);
      stack.pop();
    }
  }
  return order;
}
