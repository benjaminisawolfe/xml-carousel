export type CopyTextResult =
  | { readonly succeeded: true }
  | { readonly succeeded: false; readonly reason: 'unavailable' | 'failed' };

export interface ClipboardTextWriter {
  writeText(text: string): Promise<void>;
}

export type CopyText = (text: string) => Promise<CopyTextResult>;

function browserClipboard(): ClipboardTextWriter | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return navigator.clipboard;
}

export async function copyText(
  text: string,
  clipboard: ClipboardTextWriter | undefined = browserClipboard(),
): Promise<CopyTextResult> {
  if (!clipboard || typeof clipboard.writeText !== 'function') {
    return { succeeded: false, reason: 'unavailable' };
  }

  try {
    await clipboard.writeText(text);
    return { succeeded: true };
  } catch {
    return { succeeded: false, reason: 'failed' };
  }
}
