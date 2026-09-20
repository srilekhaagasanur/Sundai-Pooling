const STORAGE_KEY = "ridematch_guest_intent";

/**
 * Persist guest destination / join target across Google OAuth redirect.
 * Uses localStorage so the draft survives the OAuth round-trip reliably.
 * @typedef {{
 *   destination?: string,
 *   placeId?: string | null,
 *   destLat?: number | null,
 *   destLng?: number | null,
 *   joinTargetId?: number | null,
 *   action?: "browse" | "post" | "join",
 * }} GuestIntent
 */

export function saveGuestIntent(intent) {
  try {
    const prev = loadGuestIntent() || {};
    const next = { ...prev, ...(intent || {}) };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (err) {
    console.warn("Could not save guest intent:", err);
  }
}

export function loadGuestIntent() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // Migrate older sessionStorage drafts if present
      const legacy = sessionStorage.getItem(STORAGE_KEY);
      if (!legacy) {
        return null;
      }
      sessionStorage.removeItem(STORAGE_KEY);
      localStorage.setItem(STORAGE_KEY, legacy);
      return JSON.parse(legacy);
    }
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearGuestIntent() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function guestIntentHasDestination(intent) {
  return Boolean(
    intent?.destination && (intent.placeId || intent.destLat != null)
  );
}

/** Show first name + last initial for the public board. */
export function publicRiderLabel(name) {
  const parts = String(name || "Rider")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) {
    return "Rider";
  }
  if (parts.length === 1) {
    return parts[0];
  }
  const last = parts[parts.length - 1];
  return `${parts[0]} ${last.charAt(0).toUpperCase()}.`;
}
