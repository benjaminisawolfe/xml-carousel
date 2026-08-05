import { describe, expect, it, vi } from 'vitest';
import {
  createWelcomePreference,
  WELCOME_PREFERENCE_KEY,
  WELCOME_PREFERENCE_VALUE,
  type WelcomePreferenceStorage,
} from './welcomePreference';

function memoryStorage(
  entries: Record<string, string> = {},
): WelcomePreferenceStorage {
  return {
    getItem: (key) => entries[key] ?? null,
    setItem: (key, value) => {
      entries[key] = value;
    },
    removeItem: (key) => {
      delete entries[key];
    },
  };
}

describe('versioned welcome preference', () => {
  it('reads only the accepted persisted dismissal value', () => {
    const absent = createWelcomePreference(() => memoryStorage());
    expect(absent.readPersistedDismissal()).toBe(false);

    const accepted = createWelcomePreference(() =>
      memoryStorage({
        [WELCOME_PREFERENCE_KEY]: WELCOME_PREFERENCE_VALUE,
      }),
    );
    expect(accepted.readPersistedDismissal()).toBe(true);
  });

  it('does not let stale or malformed values suppress a newer welcome', () => {
    const stale = createWelcomePreference(() =>
      memoryStorage({
        'xml-carousel:welcome-dismissed:v0': WELCOME_PREFERENCE_VALUE,
      }),
    );
    const malformed = createWelcomePreference(() =>
      memoryStorage({ [WELCOME_PREFERENCE_KEY]: '{not-dismissed}' }),
    );

    expect(stale.readPersistedDismissal()).toBe(false);
    expect(malformed.readPersistedDismissal()).toBe(false);
  });

  it('fails safely when storage reads throw', () => {
    const preference = createWelcomePreference(() => ({
      getItem: () => {
        throw new Error('denied');
      },
      setItem: vi.fn(),
      removeItem: vi.fn(),
    }));

    expect(preference.readPersistedDismissal()).toBe(false);
  });

  it('removes the versioned dismissal for an unchecked close', () => {
    const removeItem = vi.fn();
    const preference = createWelcomePreference(() => ({
      getItem: () => WELCOME_PREFERENCE_VALUE,
      setItem: vi.fn(),
      removeItem,
    }));

    expect(preference.removePersistedDismissal()).toBe(true);

    expect(removeItem).toHaveBeenCalledWith(WELCOME_PREFERENCE_KEY);
  });

  it('reports write and removal failures without throwing', () => {
    const preference = createWelcomePreference(() => ({
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    }));

    expect(preference.persistDismissal()).toBe(false);
    expect(preference.removePersistedDismissal()).toBe(false);
  });

  it('invalidates a dismissal when removal fails but storage remains writable', () => {
    const entries = {
      [WELCOME_PREFERENCE_KEY]: WELCOME_PREFERENCE_VALUE,
    };
    const preference = createWelcomePreference(() => ({
      getItem: (key) => entries[key as keyof typeof entries] ?? null,
      setItem: (key, value) => {
        entries[key as keyof typeof entries] = value;
      },
      removeItem: () => {
        throw new Error('denied');
      },
    }));

    expect(preference.removePersistedDismissal()).toBe(true);
    expect(preference.readPersistedDismissal()).toBe(false);
  });

  it('writes only the versioned current preference', () => {
    const setItem = vi.fn();
    const preference = createWelcomePreference(() => ({
      getItem: () => null,
      setItem,
      removeItem: vi.fn(),
    }));

    expect(preference.persistDismissal()).toBe(true);
    expect(setItem).toHaveBeenCalledWith(
      WELCOME_PREFERENCE_KEY,
      WELCOME_PREFERENCE_VALUE,
    );
  });

  it('reports unavailable storage without claiming persistence', () => {
    const preference = createWelcomePreference(() => undefined);

    expect(preference.readPersistedDismissal()).toBe(false);
    expect(preference.persistDismissal()).toBe(false);
    expect(preference.removePersistedDismissal()).toBe(false);
  });
});
