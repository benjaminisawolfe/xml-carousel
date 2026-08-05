import type {
  XsdAnnotationEntryMetadata,
  XsdNodeMetadata,
} from './xsdProjectMetadata';

export interface OrderedXsdAnnotationEntry {
  readonly entry: XsdAnnotationEntryMetadata;
  readonly annotationOrder: number;
  readonly annotationOffset: number;
  readonly entryOrder: number;
  readonly entryOffset: number;
  readonly stableIndex: number;
}

/**
 * Returns annotation entries in the accepted source order used by the
 * inspector and focused-card presentations. The returned array and wrapper
 * objects are newly allocated; entry metadata remains read-only input data.
 */
export function selectOrderedXsdAnnotationEntries(
  metadata: XsdNodeMetadata | undefined,
): readonly OrderedXsdAnnotationEntry[] {
  const orderedAnnotations = (metadata?.annotations ?? [])
    .map((annotation, annotationIndex) => ({
      annotation,
      annotationIndex,
    }))
    .sort(
      (left, right) =>
        left.annotation.sourceOrder - right.annotation.sourceOrder ||
        left.annotation.sourceRange.start.offset -
          right.annotation.sourceRange.start.offset ||
        left.annotationIndex - right.annotationIndex,
    );
  const entries: OrderedXsdAnnotationEntry[] = [];
  let stableIndex = 0;

  for (const { annotation } of orderedAnnotations) {
    const orderedEntries = annotation.entries
      .map((entry, entryIndex) => ({ entry, entryIndex }))
      .sort(
        (left, right) =>
          left.entry.sourceOrder - right.entry.sourceOrder ||
          left.entry.sourceRange.start.offset -
            right.entry.sourceRange.start.offset ||
          left.entryIndex - right.entryIndex,
      );

    for (const { entry } of orderedEntries) {
      entries.push({
        entry,
        annotationOrder: annotation.sourceOrder,
        annotationOffset: annotation.sourceRange.start.offset,
        entryOrder: entry.sourceOrder,
        entryOffset: entry.sourceRange.start.offset,
        stableIndex,
      });
      stableIndex += 1;
    }
  }

  return entries;
}
