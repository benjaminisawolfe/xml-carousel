export function compareUnicodeCodePoints(left: string, right: string): number {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0)!);
  const rightPoints = Array.from(right, (character) =>
    character.codePointAt(0)!,
  );
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    const difference = leftPoints[index] - rightPoints[index];
    if (difference !== 0) return difference;
  }
  return leftPoints.length - rightPoints.length;
}

export function clonePlainValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => clonePlainValue(entry)) as T;
  }
  if (value && typeof value === 'object') {
    const clone: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      clone[key] = clonePlainValue(entry);
    }
    return clone as T;
  }
  return value;
}

export function deepFreezePlain<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) {
    deepFreezePlain(child);
  }
  return Object.freeze(value);
}

export interface ControlledProjectPathResolution {
  readonly status: 'resolved' | 'blocked';
  readonly detail: string;
  readonly path?: string;
}

export function resolveControlledProjectPath(
  referringPath: string,
  rawTarget: string,
): ControlledProjectPathResolution {
  if (
    rawTarget.includes('\\') ||
    rawTarget.startsWith('/') ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(rawTarget) ||
    /^[A-Za-z]:/u.test(rawTarget)
  ) {
    return {
      status: 'blocked',
      detail: 'Blocked: absolute, scheme, or non-project path',
    };
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawTarget);
  } catch {
    return { status: 'blocked', detail: 'Blocked: invalid encoded path' };
  }
  if (decoded !== rawTarget && /(?:^|\/)\.\.(?:\/|$)|[\\/]/u.test(decoded)) {
    return {
      status: 'blocked',
      detail: 'Blocked: encoded traversal or separator',
    };
  }
  const base = referringPath.split('/').slice(0, -1);
  for (const segment of rawTarget.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (base.length === 0) {
        return {
          status: 'blocked',
          detail: 'Blocked: traversal outside project root',
        };
      }
      base.pop();
    } else {
      base.push(segment);
    }
  }
  return {
    status: 'resolved',
    detail: 'Resolved within controlled project root',
    path: base.join('/'),
  };
}
