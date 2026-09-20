import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { IHQ_PICKUP } from "../lib/uber";

const ihqIcon = L.divIcon({
  className: "guest-map__marker-wrap",
  html: '<span class="guest-map__pin guest-map__pin--ihq">IHQ</span>',
  iconSize: [44, 28],
  iconAnchor: [22, 14],
});

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function dropoffIcon(label) {
  const short = escapeHtml((label || "Stop").slice(0, 18));
  return L.divIcon({
    className: "guest-map__marker-wrap",
    html: `<span class="guest-map__pin guest-map__pin--drop">${short}</span>`,
    iconSize: [Math.min(160, 12 + short.length * 7), 28],
    iconAnchor: [Math.min(80, 6 + short.length * 3.5), 14],
  });
}

/**
 * Free OSM map via Leaflet — no Google/Maps billing.
 * pins: [{ id, lat, lng, label }]
 */
export default function GuestBoardMap({ pins = [] }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return undefined;
    }

    const map = L.map(containerRef.current, {
      scrollWheelZoom: false,
      attributionControl: true,
    }).setView([IHQ_PICKUP.latitude, IHQ_PICKUP.longitude], 13);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    const onResize = () => map.invalidateSize();
    window.addEventListener("resize", onResize);
    const t = setTimeout(() => map.invalidateSize(), 80);

    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", onResize);
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) {
      return;
    }

    layer.clearLayers();

    const bounds = [];

    L.marker([IHQ_PICKUP.latitude, IHQ_PICKUP.longitude], {
      icon: ihqIcon,
      title: "IHQ · 292 Main St",
    })
      .bindPopup("<strong>IHQ meetup</strong><br/>292 Main St")
      .addTo(layer);
    bounds.push([IHQ_PICKUP.latitude, IHQ_PICKUP.longitude]);

    pins.forEach((pin) => {
      if (pin.lat == null || pin.lng == null) {
        return;
      }
      const lat = Number(pin.lat);
      const lng = Number(pin.lng);
      if (Number.isNaN(lat) || Number.isNaN(lng)) {
        return;
      }
      const label = pin.label || "Dropoff";
      L.marker([lat, lng], {
        icon: dropoffIcon(label),
        title: label,
      })
        .bindPopup(escapeHtml(label))
        .addTo(layer);
      bounds.push([lat, lng]);
    });

    if (bounds.length === 1) {
      map.setView(bounds[0], 13);
    } else if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 14 });
    }

    setTimeout(() => map.invalidateSize(), 40);
  }, [pins]);

  return (
    <div className="guest-map">
      <div className="guest-map__canvas" ref={containerRef} />
      <p className="guest-map__credit">Map · OpenStreetMap (free)</p>
    </div>
  );
}
