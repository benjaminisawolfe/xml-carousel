import type { XsdXmlNodeAst } from './xsdXmlAst';

function collectText(
  nodes: readonly XsdXmlNodeAst[],
  fragments: string[],
): void {
  for (const node of nodes) {
    if (node.kind === 'text' || node.kind === 'cdata') {
      fragments.push(node.value);
    } else if (node.kind === 'element') {
      collectText(node.children, fragments);
    }
  }
}

/**
 * Extracts safe human-readable text from XML mixed content without
 * interpreting markup. Whitespace is normalized only after all source-order
 * text and CDATA fragments have been collected so punctuation adjacency is
 * preserved.
 */
export function extractXsdMixedContentText(
  nodes: readonly XsdXmlNodeAst[],
): string {
  const fragments: string[] = [];
  collectText(nodes, fragments);
  return fragments
    .join('')
    .replace(/[\t\n\r ]+/g, ' ')
    .trim();
}
