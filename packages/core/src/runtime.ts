export type IdFactory = (prefix: string) => string;

export function createSequentialIdFactory(initialValue = 0): IdFactory {
  if (!Number.isSafeInteger(initialValue) || initialValue < 0) {
    throw new RangeError("Initial ID sequence value must be a non-negative safe integer.");
  }

  let sequence = initialValue;
  return (prefix) => {
    sequence += 1;
    return `${prefix}-${sequence}`;
  };
}
