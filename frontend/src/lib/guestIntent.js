const STORAGE_KEY = "ridematch_guest_intent";

/**
 * Persist guest destination / join target across Google OAuth redirect.
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
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(intent || {}));
  } catch (err) {
    console.warn("Could not save guest intent:", err);
  }
}

export function loadGuestIntent() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearGuestIntent() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
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
