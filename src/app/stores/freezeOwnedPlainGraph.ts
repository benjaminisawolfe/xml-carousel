function isPlainObject(value: object): value is Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Freezes a structured-cloned plain-data graph without recursion or replacement
 * allocation. Unsupported object types are left untouched.
 */
export function freezeOwnedPlainGraph<T>(value: T): T {
  if (typeof value !== 'object' || value === null) return value;

  const pending: object[] = [value];
  const visited = new WeakSet<object>();
  const accepted: object[] = [];

  while (pending.length > 0) {
    const current = pending.pop()!;
    if (visited.has(current)) continue;
    visited.add(current);

    if (!Array.isArray(current) && !isPlainObject(current)) continue;
    accepted.push(current);

    const children = Array.isArray(current) ? current : Object.values(current);
    for (const child of children) {
      if (typeof child === 'object' && child !== null && !visited.has(child)) {
        pending.push(child);
      }
    }
  }

  for (let index = accepted.length - 1; index >= 0; index -= 1) {
    Object.freeze(accepted[index]);
  }

  return value;
}
