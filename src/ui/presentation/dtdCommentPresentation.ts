export const dtdCommentExcerptLength = 160;

export function normalizeDtdCommentDisplayText(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');

  while (lines.length > 0 && lines[0]?.trim().length === 0) lines.shift();
  while (lines.length > 0 && lines[lines.length - 1]?.trim().length === 0) {
    lines.pop();
  }

  const nonblankIndentation = lines
    .filter((line) => line.trim().length > 0)
    .map((line) => line.match(/^[\t ]*/)?.[0].length ?? 0);
  const commonIndentation =
    nonblankIndentation.length > 0 ? Math.min(...nonblankIndentation) : 0;

  return lines
    .map((line) => line.slice(Math.min(commonIndentation, line.length)))
    .join('\n')
    .trim();
}

export function buildDtdCommentExcerpt(
  text: string,
  maximumLength = dtdCommentExcerptLength,
): string {
  const displayText = normalizeDtdCommentDisplayText(text);
  if (displayText.length <= maximumLength) return displayText;
  if (maximumLength <= 1) return '…'.slice(0, Math.max(maximumLength, 0));
  return `${displayText.slice(0, maximumLength - 1).replace(/\s+$/, '')}…`;
}
