import { describe, expect, it } from 'vitest';

import { normalizeReleaseText } from '../../scripts/release-text-assets.js';

describe('release text assets', () => {
  it('normalizes checkout-dependent line endings to LF', () => {
    expect(normalizeReleaseText('first\r\nsecond\rthird\nfourth')).toBe(
      'first\nsecond\nthird\nfourth',
    );
  });

  it('leaves canonical LF text unchanged', () => {
    const canonical = 'first\nsecond\n';
    expect(normalizeReleaseText(canonical)).toBe(canonical);
  });
});
