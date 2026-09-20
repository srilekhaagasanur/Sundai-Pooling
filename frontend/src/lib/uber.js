import { haversineMeters } from "./matching/distance";

export const IHQ_PICKUP = {
  // 292 Main St / Kendall Open Space (not 55 Broadway next door)
  latitude: 42.36228,
  longitude: -71.08586,
  addressLine1: "292 Main St",
  addressLine2: "Cambridge, MA 02142",
};

function encodeLocation(loc) {
  return encodeURIComponent(
    JSON.stringify({
      latitude: loc.latitude,
      longitude: loc.longitude,
      addressLine1: loc.addressLine1 || "",
      addressLine2: loc.addressLine2 || "",
    })
  );
}

/**
 * Build Uber multi-stop (or single-drop) looking link.
 * drops: [{ latitude, longitude, addressLine1, addressLine2 }, ...]
 */
export function buildUberLookingLink({ pickup = IHQ_PICKUP, drops }) {
  const parts = [`pickup=${encodeLocation(pickup)}`];
  (drops || []).forEach((drop, index) => {
    parts.push(`drop[${index}]=${encodeLocation(drop)}`);
  });
  return `https://m.uber.com/looking?${parts.join("&")}`;
}

/**
 * Order two dropoffs: recommended (shorter haversine path) + reverse.
 * Returns null drops if we can't build a multi-stop.
 */
export function orderDropoffs(pickup, stopA, stopB) {
  if (!stopA?.latitude || !stopA?.longitude) {
    return null;
  }
  if (!stopB?.latitude || !stopB?.longitude) {
    return {
      recommended: [stopA],
      reverse: [stopA],
      sameStop: true,
    };
  }

  const samePlace =
    (stopA.placeId && stopB.placeId && stopA.placeId === stopB.placeId) ||
    (Math.abs(stopA.latitude - stopB.latitude) < 1e-5 &&
      Math.abs(stopA.longitude - stopB.longitude) < 1e-5);

  if (samePlace) {
    return {
      recommended: [stopA],
      reverse: [stopA],
      sameStop: true,
    };
  }

  const pathAB =
    haversineMeters(
      pickup.latitude,
      pickup.longitude,
      stopA.latitude,
      stopA.longitude
    ) +
    haversineMeters(
      stopA.latitude,
      stopA.longitude,
      stopB.latitude,
      stopB.longitude
    );

  const pathBA =
    haversineMeters(
      pickup.latitude,
      pickup.longitude,
      stopB.latitude,
      stopB.longitude
    ) +
    haversineMeters(
      stopB.latitude,
      stopB.longitude,
      stopA.latitude,
      stopA.longitude
    );

  const aFirst = pathAB <= pathBA;
  return {
    recommended: aFirst ? [stopA, stopB] : [stopB, stopA],
    reverse: aFirst ? [stopB, stopA] : [stopA, stopB],
    sameStop: false,
    recommendedMeters: Math.min(pathAB, pathBA),
    reverseMeters: Math.max(pathAB, pathBA),
  };
}

export function stopFromRideFields({
  destination,
  dest_lat,
  dest_lng,
  place_id,
  name,
}) {
  if (dest_lat == null || dest_lng == null) {
    return null;
  }
  return {
    latitude: Number(dest_lat),
    longitude: Number(dest_lng),
    addressLine1: name || destination?.split(",")[0] || "Stop",
    addressLine2: destination || "",
    placeId: place_id || null,
  };
}

/** Build dropoff stops from locked ride members (prefer member fields, else ride). */
export function stopsFromLockedRide(ride) {
  const members = ride?.members || [];
  const fromMembers = members
    .map((member) => {
      if (member.dest_lat == null || member.dest_lng == null) {
        return null;
      }
      return {
        latitude: Number(member.dest_lat),
        longitude: Number(member.dest_lng),
        addressLine1:
          member.destination?.split(",")[0] || member.name || "Stop",
        addressLine2: member.destination || "",
        placeId: member.place_id || null,
        userId: member.user_id || null,
      };
    })
    .filter(Boolean);

  if (fromMembers.length >= 1) {
    return fromMembers;
  }

  const fallback = stopFromRideFields(ride);
  return fallback ? [fallback] : [];
}

export function shortStopLabel(stop) {
  return stop?.addressLine1 || stop?.addressLine2 || "Stop";
}
