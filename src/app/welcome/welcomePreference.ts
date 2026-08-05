export const WELCOME_PREFERENCE_KEY = 'xml-carousel:welcome-dismissed:v1';
export const WELCOME_PREFERENCE_VALUE = 'dismissed';

export interface WelcomePreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface WelcomePreference {
  readPersistedDismissal(): boolean;
  persistDismissal(): boolean;
  removePersistedDismissal(): boolean;
}

type StorageProvider = () => WelcomePreferenceStorage | undefined;

function browserStorage(): WelcomePreferenceStorage | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.localStorage;
}

export function createWelcomePreference(
  storageProvider: StorageProvider = browserStorage,
): WelcomePreference {
  return {
    readPersistedDismissal() {
      try {
        return (
          storageProvider()?.getItem(WELCOME_PREFERENCE_KEY) ===
          WELCOME_PREFERENCE_VALUE
        );
      } catch {
        return false;
      }
    },
    persistDismissal() {
      try {
        const storage = storageProvider();
        if (!storage) return false;
        storage.setItem(WELCOME_PREFERENCE_KEY, WELCOME_PREFERENCE_VALUE);
        return true;
      } catch {
        return false;
      }
    },
    removePersistedDismissal() {
      let storage: WelcomePreferenceStorage | undefined;
      try {
        storage = storageProvider();
        if (!storage) return false;
        storage.removeItem(WELCOME_PREFERENCE_KEY);
        return true;
      } catch {
        try {
          storage?.setItem(WELCOME_PREFERENCE_KEY, '');
          return storage !== undefined;
        } catch {
          return false;
        }
      }
    },
  };
}
