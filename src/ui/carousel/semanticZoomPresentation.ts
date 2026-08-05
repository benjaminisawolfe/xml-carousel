import type { SemanticZoomLevel } from '../../app/stores/semanticZoomStore';

export const IMPLEMENTED_SEMANTIC_ZOOM_PRESENTATIONS = Object.freeze([
  'full',
  'compact',
] as const);

export type ImplementedSemanticZoomPresentation =
  (typeof IMPLEMENTED_SEMANTIC_ZOOM_PRESENTATIONS)[number];

export const SEMANTIC_ZOOM_CONTROL_VALUES = Object.freeze({
  compact: 1,
  full: 2,
} as const satisfies Readonly<
  Record<ImplementedSemanticZoomPresentation, number>
>);

export function isImplementedSemanticZoomPresentation(
  value: unknown,
): value is ImplementedSemanticZoomPresentation {
  return (
    typeof value === 'string' &&
    IMPLEMENTED_SEMANTIC_ZOOM_PRESENTATIONS.some((level) => level === value)
  );
}

export function resolveImplementedSemanticZoomPresentation(
  effectiveLevel: SemanticZoomLevel,
): ImplementedSemanticZoomPresentation {
  switch (effectiveLevel) {
    case 'full':
      return 'full';
    case 'compact':
    case 'overview':
      return 'compact';
    default:
      throw new TypeError(
        `Unknown implemented semantic zoom presentation: ${String(effectiveLevel)}`,
      );
  }
}

export function semanticZoomControlValue(
  presentation: ImplementedSemanticZoomPresentation,
): number {
  return SEMANTIC_ZOOM_CONTROL_VALUES[presentation];
}

export function implementedSemanticZoomPresentationFromControlValue(
  value: number,
): ImplementedSemanticZoomPresentation | undefined {
  if (value === SEMANTIC_ZOOM_CONTROL_VALUES.compact) return 'compact';
  if (value === SEMANTIC_ZOOM_CONTROL_VALUES.full) return 'full';
  return undefined;
}
