import { useEffect, useState } from "react";
import DestinationAutocomplete from "./DestinationAutocomplete";
import { publicRiderLabel } from "../lib/guestIntent";
import {
  countOpenRides,
  previewMatchesForDestination,
} from "../lib/rides";

const ORIGIN_LABEL = "292 Main St, Cambridge (IHQ)";

/**
 * Logged-out home: explain product, try a destination, browse nearby open rides.
 * onContinue(intent) should persist intent and start Google sign-in.
 */
export default function GuestHome({ onContinue, authLoading, error }) {
  const [destination, setDestination] = useState("");
  const [placeId, setPlaceId] = useState(null);
  const [destLat, setDestLat] = useState(null);
  const [destLng, setDestLng] = useState(null);
  const [openCount, setOpenCount] = useState(null);
  const [preview, setPreview] = useState([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [localError, setLocalError] = useState("");

  const canContinue = Boolean(destination && (placeId || destLat != null));

  useEffect(() => {
    let active = true;

    const refreshCount = async () => {
      try {
        const count = await countOpenRides();
        if (active) {
          setOpenCount(count);
        }
      } catch (err) {
        console.error("Error counting open rides:", err);
      }
    };

    refreshCount();
    const id = setInterval(refreshCount, 2000);
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
            <strong>Pick your dropoff</strong>
            <span>Everyone leaves from {ORIGIN_LABEL}.</span>
          </li>
          <li>
            <strong>Match nearby</strong>
            <span>We show riders within ~2 miles of your destination.</span>
          </li>
          <li>
            <strong>Confirm &amp; ride</strong>
            <span>Lock in, then open Uber with a smart stop order.</span>
          </li>
        </ol>
        <p className="guest-board-count">
          {openCount == null
            ? "Checking who's looking…"
            : openCount === 0
              ? "No one on the board yet — be the first."
              : openCount === 1
                ? "1 person looking for a pair right now."
                : `${openCount} people looking for a pair right now.`}
        </p>
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
            <h2>Nearby on the board</h2>
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
