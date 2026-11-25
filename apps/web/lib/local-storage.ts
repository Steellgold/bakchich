/** Low-level localStorage access: storage can be blocked or missing (private window, iframe, server render), so reads fall back and writes are ignored. */
export const readStored = (key: string, fallback: string) => {
  try {
    return window.localStorage.getItem(key) ?? fallback;
  }
  catch {
    return fallback;
  }
};

export const writeStored = (key: string, value: string) => {
  try {
    window.localStorage.setItem(key, value);
  }
  catch {
    // Storage unavailable: the setting only lasts until the page closes.
  }
};
