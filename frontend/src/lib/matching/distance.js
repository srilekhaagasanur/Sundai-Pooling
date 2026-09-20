/** Great-circle distance in meters between two WGS84 points. */
export function haversineMeters(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const r = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}

export function formatDistanceLabel(meters) {
  if (meters == null || Number.isNaN(meters)) {
    return "";
  }
  if (meters < 50) {
    return "Same area";
  }
  const miles = meters / 1609.344;
  if (miles < 0.1) {
    return `${Math.round(meters)} m away`;
  }
  return `${miles.toFixed(1)} mi from your dropoff`;
}
