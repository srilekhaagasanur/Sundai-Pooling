const ORS_BASE = "https://api.openrouteservice.org/v2";
const ORS_KEY = import.meta.env.VITE_OPENROUTESERVICE_API_KEY;

export function hasOrsKey() {
  return Boolean(ORS_KEY);
}

function toLngLat({ latitude, longitude, lat, lng }) {
  const la = latitude ?? lat;
  const lo = longitude ?? lng;
  if (la == null || lo == null) {
    return null;
  }
  return [Number(lo), Number(la)];
}

async function orsPost(path, body) {
  if (!ORS_KEY) {
    throw new Error("OpenRouteService key not configured");
  }

  const response = await fetch(`${ORS_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: ORS_KEY,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `ORS ${response.status}: ${text.slice(0, 180) || response.statusText}`
    );
  }

  return response.json();
}

/**
 * One-to-many road distances (meters) + durations (seconds).
 * origin: {latitude, longitude}
 * destinations: same shape[]
 * Returns parallel arrays; null entry if a pair could not be routed.
 */
export async function matrixFromOrigin(origin, destinations) {
  const originLngLat = toLngLat(origin);
  if (!originLngLat) {
    throw new Error("Missing origin coordinates");
  }

  const destLngLats = destinations.map(toLngLat);
  if (destLngLats.some((p) => !p)) {
    throw new Error("Missing destination coordinates");
  }

  if (destLngLats.length === 0) {
    return { distances: [], durations: [] };
  }

  const locations = [originLngLat, ...destLngLats];
  const data = await orsPost("/matrix/driving-car", {
    locations,
    sources: [0],
    destinations: destinations.map((_, index) => index + 1),
    metrics: ["distance", "duration"],
    units: "m",
  });

  const distances = data?.distances?.[0] || [];
  const durations = data?.durations?.[0] || [];

  return {
    distances: destinations.map((_, i) =>
      distances[i] == null ? null : Number(distances[i])
    ),
    durations: destinations.map((_, i) =>
      durations[i] == null ? null : Number(durations[i])
    ),
  };
}

/**
 * Drive path through waypoints (including origin as first point).
 * points: [{latitude, longitude}, ...] length >= 2
 */
export async function routeThrough(points) {
  const coordinates = points.map(toLngLat);
  if (coordinates.some((p) => !p) || coordinates.length < 2) {
    throw new Error("Need at least two valid coordinates for a route");
  }

  const data = await orsPost("/directions/driving-car", {
    coordinates,
    units: "m",
  });

  const summary = data?.routes?.[0]?.summary;
  if (!summary) {
    throw new Error("ORS returned no route");
  }

  return {
    meters: Number(summary.distance),
    seconds: Number(summary.duration),
  };
}
