import { formatDistanceLabel, haversineMeters } from "./distance";

/** Default nearby radius for haversine matching (~1.5 km). */
export const NEARBY_RADIUS_METERS = 1500;

/**
 * Score a candidate against my ride.
 * Return null to exclude. Lower score = better match.
 * Swap this for a Maps road-distance scorer later without changing rankMatches.
 *
 * @returns {{ score: number, label: string, meta: object } | null}
 */
export function haversineScorer(myRide, otherRide) {
  if (myRide.place_id && otherRide.place_id && myRide.place_id === otherRide.place_id) {
    return {
      score: 0,
      label: "Same place",
      meta: { meters: 0, method: "place_id" },
    };
  }

  const myLat = myRide.dest_lat;
  const myLng = myRide.dest_lng;
  const otherLat = otherRide.dest_lat;
  const otherLng = otherRide.dest_lng;

  if (
    myLat != null &&
    myLng != null &&
    otherLat != null &&
    otherLng != null
  ) {
    const meters = haversineMeters(myLat, myLng, otherLat, otherLng);
    if (meters > NEARBY_RADIUS_METERS) {
      return null;
    }
    return {
      score: meters,
      label: formatDistanceLabel(meters),
      meta: { meters, method: "haversine" },
    };
  }

  // Legacy rows without coords: exact destination text only
  if (myRide.destination && myRide.destination === otherRide.destination) {
    return {
      score: 0,
      label: "Same destination",
      meta: { meters: 0, method: "destination" },
    };
  }

  return null;
}

/** Active scorer — change this (or pass an override) to use road distance later. */
export const defaultMatchScorer = haversineScorer;
