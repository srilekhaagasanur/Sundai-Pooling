import { useEffect, useRef } from "react";
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

// Bias suggestions toward Kendall / 292 Main area
const ORIGIN_BIAS = {
  center: { lat: 42.3635, lng: -71.0843 },
  radius: 25000,
};

let mapsConfigured = false;

function ensureMapsOptions() {
  if (mapsConfigured || !API_KEY) {
    return;
  }
  setOptions({ key: API_KEY, v: "weekly" });
  mapsConfigured = true;
}

/**
 * Google Place Autocomplete widget.
 * onSelect({ label, placeId, lat, lng })
 */
export default function DestinationAutocomplete({
  disabled = false,
  initialValue = "",
  onSelect,
}) {
  const hostRef = useRef(null);
  const widgetRef = useRef(null);

  useEffect(() => {
    if (!API_KEY || !hostRef.current) {
      return undefined;
    }

    let cancelled = false;

    async function mount() {
      ensureMapsOptions();
      const { PlaceAutocompleteElement } = await importLibrary("places");
      if (cancelled || !hostRef.current) {
        return;
      }

      hostRef.current.replaceChildren();

      const autocomplete = new PlaceAutocompleteElement({
        includedRegionCodes: ["us"],
        locationBias: ORIGIN_BIAS,
      });
      autocomplete.placeholder = "Search for a destination…";
      if (initialValue) {
        autocomplete.value = initialValue;
      }
      if (disabled) {
        autocomplete.disabled = true;
      }

      autocomplete.addEventListener("gmp-select", async (event) => {
        try {
          const place = event.placePrediction.toPlace();
          await place.fetchFields({
            fields: ["id", "displayName", "formattedAddress", "location"],
          });

          const lat = place.location?.lat?.() ?? place.location?.lat;
          const lng = place.location?.lng?.() ?? place.location?.lng;
          const label =
            place.formattedAddress ||
            place.displayName ||
            event.placePrediction?.text?.toString?.() ||
            "";

          onSelect?.({
            label,
            placeId: place.id || null,
            lat: typeof lat === "function" ? lat() : lat,
            lng: typeof lng === "function" ? lng() : lng,
          });
        } catch (err) {
          console.error("Error reading place details:", err);
        }
      });

      hostRef.current.appendChild(autocomplete);
      widgetRef.current = autocomplete;
    }

    mount().catch((err) => {
      console.error("Error loading Places Autocomplete:", err);
    });

    return () => {
      cancelled = true;
      widgetRef.current = null;
      if (hostRef.current) {
        hostRef.current.replaceChildren();
      }
    };
    // Remount when disabled flips so the widget locks during pairing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);

  useEffect(() => {
    const widget = widgetRef.current;
    if (!widget || initialValue == null) {
      return;
    }
    if (widget.value !== initialValue) {
      widget.value = initialValue;
    }
  }, [initialValue]);

  if (!API_KEY) {
    return (
      <input
        type="text"
        placeholder="Add VITE_GOOGLE_MAPS_API_KEY for Places search"
        disabled
      />
    );
  }

  return <div className="places-autocomplete" ref={hostRef} />;
}

export function hasPlacesKey() {
  return Boolean(API_KEY);
}
