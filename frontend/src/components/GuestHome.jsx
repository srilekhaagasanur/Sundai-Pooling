import { useEffect, useMemo, useState } from "react";
import DestinationAutocomplete from "./DestinationAutocomplete";
import GuestBoardMap from "./GuestBoardMap";
import { publicRiderLabel, saveGuestIntent } from "../lib/guestIntent";
import {
  listOpenRides,
  previewMatchesForDestination,
} from "../lib/rides";

const ORIGIN_LABEL = "292 Main St, Cambridge (IHQ)";

function shortDestination(destination) {
  if (!destination) {
    return "Dropoff";
  }
  return destination.split(",")[0].trim() || destination;
}

/**
 * Logged-out home: explain product, public dropoff board + free OSM map,
 * try a destination, then sign in to post/join.
 */
export default function GuestHome({ onContinue, authLoading, error }) {
  const [destination, setDestination] = useState("");
  const [placeId, setPlaceId] = useState(null);
  const [destLat, setDestLat] = useState(null);
  const [destLng, setDestLng] = useState(null);
  const [openRides, setOpenRides] = useState([]);
  const [boardLoading, setBoardLoading] = useState(true);
  const [preview, setPreview] = useState([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [localError, setLocalError] = useState("");

  const canContinue = Boolean(destination && (placeId || destLat != null));
  const openCount = openRides.length;

  useEffect(() => {
    let active = true;

    const refreshBoard = async () => {
      try {
        const rides = await listOpenRides();
        if (active) {
          setOpenRides(rides);
          setBoardLoading(false);
        }
      } catch (err) {
        console.error("Error loading open rides:", err);
        if (active) {
          setBoardLoading(false);
        }
      }
    };

    refreshBoard();
    const id = setInterval(refreshBoard, 2000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (!canContinue) {
      setPreview([]);
      setPreviewLoading(false);
      return undefined;
    }

    let active = true;
    let firstLoad = true;
    setPreviewLoading(true);
    setLocalError("");

    const refreshPreview = async () => {
      try {
        const matches = await previewMatchesForDestination({
          destination,
          placeId,
          destLat,
          destLng,
        });
        if (active) {
          setPreview(matches);
          setLocalError("");
        }
      } catch (err) {
        console.error("Error previewing matches:", err);
        if (active) {
          setLocalError(err.message || "Could not load nearby riders.");
        }
      } finally {
        if (active && firstLoad) {
          setPreviewLoading(false);
          firstLoad = false;
        }
      }
    };

    const initialTimer = setTimeout(refreshPreview, 250);
    const id = setInterval(refreshPreview, 2000);

    return () => {
      active = false;
      clearTimeout(initialTimer);
      clearInterval(id);
    };
  }, [canContinue, destination, placeId, destLat, destLng]);

  const mapPins = useMemo(() => {
    const source = canContinue && preview.length > 0 ? preview : openRides;
    return source
      .filter((ride) => ride.dest_lat != null && ride.dest_lng != null)
      .map((ride) => ({
        id: ride.id,
        lat: ride.dest_lat,
        lng: ride.dest_lng,
        label: shortDestination(ride.destination),
      }));
  }, [canContinue, preview, openRides]);

  const intentBase = {
    destination,
    placeId,
    destLat,
    destLng,
  };

  const handlePost = () => {
    if (!canContinue) {
      setLocalError("Pick a destination from the suggestions first.");
      return;
    }
    onContinue({ ...intentBase, action: "post", joinTargetId: null });
  };

  const handleJoin = (matchId) => {
    if (!canContinue) {
      setLocalError("Pick a destination from the suggestions first.");
      return;
    }
    onContinue({
      ...intentBase,
      action: "join",
      joinTargetId: matchId,
    });
  };

  const handleSignInOnly = () => {
    onContinue({ action: "browse" });
  };

  return (
    <>
      <section className="guest-howto">
        <h2 className="guest-howto__title">How it works</h2>
        <ol className="guest-howto__steps">
          <li>
            <span className="guest-howto__num" aria-hidden="true">
              1
            </span>
            <div>
              <strong>Pick your dropoff</strong>
              <span>Everyone leaves from IHQ at 292 Main St.</span>
            </div>
          </li>
          <li>
            <span className="guest-howto__num" aria-hidden="true">
              2
            </span>
            <div>
              <strong>Match nearby</strong>
              <span>See riders within ~2 miles of your destination.</span>
            </div>
          </li>
          <li>
            <span className="guest-howto__num" aria-hidden="true">
              3
            </span>
            <div>
              <strong>Confirm &amp; open Uber</strong>
              <span>Lock in, then share a multi-stop ride from IHQ.</span>
            </div>
          </li>
        </ol>
        <p className="guest-board-count">
          {boardLoading
            ? "Checking who's looking…"
            : openCount === 0
              ? "No one on the board yet — be the first."
              : openCount === 1
                ? "1 person looking for a pair right now."
                : `${openCount} people looking for a pair right now.`}
        </p>
      </section>

      <section className="matches guest-public-board">
        <div className="panel-header">
          <h2>{canContinue ? "Nearby on the map" : "Where people are headed"}</h2>
        </div>
        <p className="form-hint guest-preview-hint">
          {canContinue
            ? "Map shows dropoffs near your destination. Names stay hidden until you sign in to join."
            : "Dropoffs only — no names. Pick your destination below to see who's nearby."}
        </p>
        <GuestBoardMap pins={mapPins} />

        {!canContinue ? (
          boardLoading ? (
            <p className="empty">Loading the board…</p>
          ) : openRides.length === 0 ? (
            <p className="empty">No open dropoffs yet.</p>
          ) : (
            <ul className="card-list guest-dest-list">
              {openRides.slice(0, 8).map((ride) => (
                <li key={ride.id} className="person-card">
                  <div className="person-card__body">
                    <strong className="person-card__name">
                      {shortDestination(ride.destination)}
                    </strong>
                    <span className="person-card__meta">
                      {ride.destination}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </section>

      <div className="ride-form">
        <label>From</label>
        <div className="origin-pill">
          <span className="origin-pill__kicker">Meetup</span>
          <span className="origin-pill__value">{ORIGIN_LABEL}</span>
        </div>

        <label>Try your destination</label>
        <DestinationAutocomplete
          initialValue={destination}
          onSelect={({ label, placeId: nextPlaceId, lat, lng }) => {
            setDestination(label);
            setPlaceId(nextPlaceId);
            setDestLat(lat ?? null);
            setDestLng(lng ?? null);
            setLocalError("");
            // Persist immediately so OAuth / header Sign in keep the address.
            saveGuestIntent({
              destination: label,
              placeId: nextPlaceId,
              destLat: lat ?? null,
              destLng: lng ?? null,
            });
          }}
        />
        {destination ? (
          <p className="form-hint">Selected: {destination}</p>
        ) : (
          <p className="form-hint">
            No sign-in needed to look — sign in only when you post or join.
          </p>
        )}

        {canContinue ? (
          <button onClick={handlePost} disabled={authLoading}>
            {authLoading ? "Redirecting…" : "Sign in to post this ride"}
          </button>
        ) : (
          <button onClick={handleSignInOnly} disabled={authLoading}>
            {authLoading ? "Redirecting…" : "Sign in with Google"}
          </button>
        )}

        {localError || error ? (
          <p className="error">{localError || error}</p>
        ) : null}
      </div>

      {canContinue ? (
        <div className="matches">
          <div className="panel-header">
            <h2>Nearby to join</h2>
          </div>

          {previewLoading ? (
            <p className="empty">Finding people within ~2 miles…</p>
          ) : preview.length === 0 ? (
            <div className="waiting-state">
              <span className="waiting-state__pulse" aria-hidden="true" />
              <div>
                <p className="waiting-state__title">No one nearby yet</p>
                <p className="waiting-state__copy">
                  Sign in to post your ride — others headed within ~2 miles of
                  your dropoff will see you.
                </p>
              </div>
            </div>
          ) : (
            <>
              <p className="form-hint guest-preview-hint">
                {preview.length === 1
                  ? "1 rider within ~2 miles of your dropoff."
                  : `${preview.length} riders within ~2 miles of your dropoff.`}
              </p>
              <ul className="card-list">
                {preview.map((match) => (
                  <li
                    key={match.id}
                    className="person-card person-card--action"
                  >
                    <div className="person-card__body">
                      <strong className="person-card__name">
                        {publicRiderLabel(match.name)}
                      </strong>
                      <span className="person-card__meta">
                        {match.destination}
                      </span>
                      {match.matchLabel ? (
                        <span className="person-card__distance">
                          {match.matchLabel}
                        </span>
                      ) : null}
                    </div>
                    <button
                      onClick={() => handleJoin(match.id)}
                      disabled={authLoading}
                    >
                      {authLoading ? "…" : "Sign in to join"}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      ) : null}
    </>
  );
}
