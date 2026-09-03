import { describe, expect, it } from 'vitest';
import tokens from '../styles/tokens.css?raw';

function luminance(hex: string): number {
  const channels = hex.match(/[a-f\d]{2}/giu)!.map((value) => {
    const channel = Number.parseInt(value, 16) / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}

function token(name: string): number {
  const value = tokens.match(
    new RegExp(`--colour-${name}:\\s*(#[a-f\\d]{6})`, 'iu'),
  )?.[1];
  if (!value) throw new Error(`Missing colour token: ${name}`);
  return luminance(value);
}

describe('0.3 candidate accessibility regressions', () => {
  it.each(['canvas', 'panel', 'panel-subtle', 'accent-soft'])(
    'keeps small muted labels readable against the %s surface',
    (surface) => {
      const foreground = token('text-muted');
      const background = token(surface);
      const contrast =
        (Math.max(foreground, background) + 0.05) /
        (Math.min(foreground, background) + 0.05);
      expect(contrast).toBeGreaterThanOrEqual(4.5);
    },
  );
});
