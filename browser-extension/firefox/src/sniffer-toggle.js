const STORAGE_KEY = "omniget_sniffer_enabled";
const WILDCARD_ORIGINS = ["*://*/*"];

let enabled = false;

// Default off. All-sites capture stays off until the stored flag is exactly
// true, including during the boot window before storage answers. The webRequest
// listeners are registered synchronously so an incoming request can wake a
// terminated service worker, and they can fire before this settles.
let statePromise = null;

export function loadSnifferState() {
  if (!statePromise) {
    statePromise = (async () => {
      try {
        const result = await chrome.storage.local.get(STORAGE_KEY);
        enabled = result[STORAGE_KEY] === true;
      } catch {
        // Storage unavailable: keep the default rather than fail the boot.
      }
      return enabled;
    })();
  }
  return statePromise;
}

export function isSnifferEnabled() {
  return enabled;
}

export async function hasWildcardHostPermission() {
  if (!chrome.permissions || typeof chrome.permissions.contains !== "function") {
    return true;
  }
  try {
    return await chrome.permissions.contains({ origins: WILDCARD_ORIGINS });
  } catch {
    return false;
  }
}

export async function requestWildcardHostPermission() {
  if (!chrome.permissions || typeof chrome.permissions.request !== "function") {
    return true;
  }
  try {
    return await chrome.permissions.request({ origins: WILDCARD_ORIGINS });
  } catch {
    return false;
  }
}

export async function setSnifferEnabled(value) {
  if (value) {
    const granted = await requestWildcardHostPermission();
    if (!granted) {
      enabled = false;
      statePromise = Promise.resolve(false);
      await chrome.storage.local.set({ [STORAGE_KEY]: false });
      return { ok: false, reason: "permission_denied" };
    }
  }
  enabled = value;
  statePromise = Promise.resolve(value);
  await chrome.storage.local.set({ [STORAGE_KEY]: value });
  return { ok: true };
}
