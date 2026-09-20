import { formatDistanceLabel } from "./distance";
import { haversineScorer } from "./scorers";
import { rankMatches } from "./rankMatches";
import { hasOrsKey, matrixFromOrigin } from "../ors";

const ROAD_CACHE_TTL_MS = 60_000;
const roadCache = new Map();

function cacheKey(myRide, shortlist) {
  const mine = `${myRide.dest_lat},${myRide.dest_lng}`;
  const others = shortlist
    .map((r) => `${r.id}:${r.dest_lat},${r.dest_lng}`)
    .join("|");
  return `${mine}::${others}`;
}

function formatRoadMatchLabel(meters, seconds) {
  const dist = formatDistanceLabel(meters).replace(" from your dropoff", "");
  if (seconds == null || Number.isNaN(seconds)) {
    return `${dist} by road`;
  }
  const mins = Math.max(1, Math.round(seconds / 60));
  return `${dist} · ~${mins} min by road`;
}

/**
 * Haversine shortlist, then one ORS matrix to re-rank by road distance.
 * Falls back to haversine labels if ORS is missing or fails.
 */
export async function rankMatchesHybrid(myRide, candidates) {
  const shortlist = rankMatches(myRide, candidates, haversineScorer);

  if (
    !hasOrsKey() ||
    shortlist.length === 0 ||
    myRide.dest_lat == null ||
    myRide.dest_lng == null
  ) {
    return shortlist;
  }

  const withCoords = shortlist.filter(
    (ride) => ride.dest_lat != null && ride.dest_lng != null
  );
  if (withCoords.length === 0) {
    return shortlist;
  }

  const key = cacheKey(myRide, withCoords);
  const cached = roadCache.get(key);
  if (cached && Date.now() - cached.at < ROAD_CACHE_TTL_MS) {
    return cached.ranked;
  }

  try {
    const { distances, durations } = await matrixFromOrigin(
      { latitude: myRide.dest_lat, longitude: myRide.dest_lng },
      withCoords.map((ride) => ({
        latitude: ride.dest_lat,
        longitude: ride.dest_lng,
      }))
    );

    const byId = new Map();
    withCoords.forEach((ride, index) => {
      const meters = distances[index];
      if (meters == null) {
        return;
      }
      byId.set(ride.id, {
        score: meters,
        label: formatRoadMatchLabel(meters, durations[index]),
        meta: {
          meters,
          seconds: durations[index],
          method: "ors_matrix",
          haversineMeters: ride.matchMeta?.meters,
        },
      });
    });

    const ranked = shortlist
      .map((ride) => {
        const road = byId.get(ride.id);
        if (!road) {
          return ride;
        }
        return {
          ...ride,
          matchScore: road.score,
          matchLabel: road.label,
          matchMeta: road.meta,
        };
      })
      .sort((a, b) => {
        if (a.matchScore !== b.matchScore) {
          return a.matchScore - b.matchScore;
        }
        const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
        return aTime - bTime;
      });

    roadCache.set(key, { at: Date.now(), ranked });
    return ranked;
  } catch (err) {
    console.warn("ORS matrix ranking failed; using haversine:", err);
    return shortlist;
  }
}
