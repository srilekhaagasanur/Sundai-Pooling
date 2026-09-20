import { haversineMeters } from "./matching/distance";
import { hasOrsKey, matrixFromOrigin, routeThrough } from "./ors";

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

function sameStop(stopA, stopB) {
  return (
    (stopA.placeId && stopB.placeId && stopA.placeId === stopB.placeId) ||
    (Math.abs(stopA.latitude - stopB.latitude) < 1e-5 &&
      Math.abs(stopA.longitude - stopB.longitude) < 1e-5)
  );
}

function pathMetersHaversine(pickup, first, second) {
  return (
    haversineMeters(
      pickup.latitude,
      pickup.longitude,
      first.latitude,
      first.longitude
    ) +
    haversineMeters(
      first.latitude,
      first.longitude,
      second.latitude,
      second.longitude
    )
  );
}

/**
 * Order two dropoffs: recommended (shorter path) + reverse.
 * Sync haversine version — used as fallback.
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
      method: "single",
    };
  }

  if (sameStop(stopA, stopB)) {
    return {
      recommended: [stopA],
      reverse: [stopA],
      sameStop: true,
      method: "same_place",
    };
  }

  const pathAB = pathMetersHaversine(pickup, stopA, stopB);
  const pathBA = pathMetersHaversine(pickup, stopB, stopA);
  const aFirst = pathAB <= pathBA;
  return {
    recommended: aFirst ? [stopA, stopB] : [stopB, stopA],
    reverse: aFirst ? [stopB, stopA] : [stopA, stopB],
    sameStop: false,
    recommendedMeters: Math.min(pathAB, pathBA),
    reverseMeters: Math.max(pathAB, pathBA),
    method: "haversine",
  };
}

/**
 * Same as orderDropoffs but prefers OpenRouteService driving distance.
 */
export async function orderDropoffsAsync(pickup, stopA, stopB) {
  const fallback = orderDropoffs(pickup, stopA, stopB);
  if (!fallback || fallback.sameStop || !hasOrsKey()) {
    return fallback;
  }

  try {
    const [routeAB, routeBA, solos] = await Promise.all([
      routeThrough([pickup, stopA, stopB]),
      routeThrough([pickup, stopB, stopA]),
      matrixFromOrigin(pickup, [stopA, stopB]),
    ]);

    const aFirst = routeAB.meters <= routeBA.meters;
    const recommended = aFirst ? [stopA, stopB] : [stopB, stopA];
    const reverse = aFirst ? [stopB, stopA] : [stopA, stopB];
    const recommendedMeters = aFirst ? routeAB.meters : routeBA.meters;
    const reverseMeters = aFirst ? routeBA.meters : routeAB.meters;
    const recommendedSeconds = aFirst ? routeAB.seconds : routeBA.seconds;
    const soloA = solos.distances[0];
    const soloB = solos.distances[1];
    const twoSoloMeters =
      soloA != null && soloB != null ? soloA + soloB : null;
    const savingsMeters =
      twoSoloMeters != null
        ? Math.max(0, twoSoloMeters - recommendedMeters)
        : null;

    return {
      recommended,
      reverse,
      sameStop: false,
      recommendedMeters,
      reverseMeters,
      recommendedSeconds,
      twoSoloMeters,
      savingsMeters,
      method: "ors",
    };
  } catch (err) {
    console.warn("ORS stop order failed; using haversine:", err);
    return fallback;
  }
}

function formatTripDistance(meters) {
  if (meters == null || Number.isNaN(meters)) {
    return "";
  }
  const miles = meters / 1609.344;
  if (miles < 0.1) {
    return `${Math.round(meters)} m`;
  }
  return `${miles.toFixed(1)} mi`;
}

function formatTripMinutes(seconds) {
  if (seconds == null || Number.isNaN(seconds)) {
    return "";
  }
  return `~${Math.max(1, Math.round(seconds / 60))} min`;
}

/** Build locked-screen Uber links + optional detour copy. */
export async function buildUberStopPlan(ride) {
  const stops = stopsFromLockedRide(ride);
  if (stops.length === 0) {
    return null;
  }

  if (stops.length === 1) {
    const link = buildUberLookingLink({ drops: stops });
    return {
      sameStop: true,
      recommendedLabel: shortStopLabel(stops[0]),
      recommendedLink: link,
      reverseLink: null,
      reverseLabel: null,
      detourLine: null,
      method: "single",
    };
  }

  const ordered = await orderDropoffsAsync(IHQ_PICKUP, stops[0], stops[1]);
  if (!ordered) {
    return null;
  }

  if (ordered.sameStop) {
    const link = buildUberLookingLink({ drops: ordered.recommended });
    return {
      sameStop: true,
      recommendedLabel: shortStopLabel(ordered.recommended[0]),
      recommendedLink: link,
      reverseLink: null,
      reverseLabel: null,
      detourLine: null,
      method: ordered.method,
    };
  }

  let detourLine = null;
  if (ordered.recommendedMeters != null) {
    const path = formatTripDistance(ordered.recommendedMeters);
    const mins = formatTripMinutes(ordered.recommendedSeconds);
    const pathBit = mins ? `${path} · ${mins}` : path;
    if (ordered.savingsMeters != null && ordered.savingsMeters >= 80) {
      detourLine = `Shared route ${pathBit}. Saves ~${formatTripDistance(ordered.savingsMeters)} vs two solo Ubers from IHQ.`;
    } else {
      detourLine = `Shared route ${pathBit}${
        ordered.method === "ors" ? " by road" : " (straight-line estimate)"
      }.`;
    }
  }

  return {
    sameStop: false,
    recommendedLabel: ordered.recommended.map(shortStopLabel).join(" → "),
    reverseLabel: ordered.reverse.map(shortStopLabel).join(" → "),
    recommendedLink: buildUberLookingLink({ drops: ordered.recommended }),
    reverseLink: buildUberLookingLink({ drops: ordered.reverse }),
    detourLine,
    method: ordered.method,
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
