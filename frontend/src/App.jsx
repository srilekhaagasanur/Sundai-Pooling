import { useEffect, useState } from "react";
import "./App.css";
import {
  displayNameFromUser,
  getSession,
  onAuthStateChange,
  signInWithGoogle,
  signOut,
} from "./lib/auth";
import {
  cancelRide,
  confirmRide,
  findActiveRideForRider,
  findMatches,
  getRide,
  joinRide,
  leavePair,
  upsertOpenRide,
} from "./lib/rides";

const FIXED_ORIGIN = "292 Main St, Cambridge, MA 02142";

const DESTINATIONS = [
  "Ashdown House - 235 Albany St",
  "84 Mass Ave",
  "Harvard Business School - 111 Western Avenue, Boston, MA 02163",
  "Northeastern University - 360 Huntington Avenue, Boston, MA 02115",
  "Central Square in Cambridge",
];

function getStatusChip(status, matchCount = 0) {
  if (status === "locked") {
    return { label: "Locked", tone: "locked" };
  }
  if (status === "pending") {
    return { label: "Confirm", tone: "confirm" };
  }
  if (status === "open") {
    if (matchCount === 0) {
      return { label: "Waiting for pair", tone: "waiting" };
    }
    return { label: "Open", tone: "open" };
  }
  return null;
}

function StatusChip({ status, matchCount = 0 }) {
  const chip = getStatusChip(status, matchCount);
  if (!chip) {
    return null;
  }

  return (
    <span className={`status-chip status-chip--${chip.tone}`}>
      {chip.label}
    </span>
  );
}

function App() {
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [destination, setDestination] = useState("");
  const [currentRide, setCurrentRide] = useState(null);
  const [myRideId, setMyRideId] = useState(null);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [joiningId, setJoiningId] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState("");

  const user = session?.user ?? null;
  const trimmedName = displayNameFromUser(user);
  const status = currentRide?.status;
  const isPaired = status === "pending" || status === "locked";
  const hasOpenRide = status === "open" && Boolean(currentRide);
  const destinationDirty =
    hasOpenRide && destination && destination !== currentRide.destination;
  const myMember = currentRide?.members?.find(
    (member) => member.name === trimmedName
  );
  const iConfirmed = Boolean(myMember?.confirmed);

  useEffect(() => {
    let active = true;

    getSession()
      .then((current) => {
        if (active) {
          setSession(current);
        }
      })
      .catch((err) => {
        console.error("Error loading session:", err);
      })
      .finally(() => {
        if (active) {
          setAuthReady(true);
        }
      });

    const subscription = onAuthStateChange((nextSession) => {
      setSession(nextSession);
      setAuthReady(true);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setCurrentRide(null);
      setMyRideId(null);
      setMatches([]);
      setDestination("");
      setRestoring(false);
      return;
    }

    if (!trimmedName) {
      return;
    }

    let active = true;
    setRestoring(true);

    findActiveRideForRider(trimmedName)
      .then(async (activeRide) => {
        if (!active || !activeRide) {
          return;
        }

        setCurrentRide(activeRide.ride);
        setMyRideId(activeRide.myRideId);
        setDestination(activeRide.ride.destination || "");

        if (activeRide.ride.status === "open") {
          const matchData = await findMatches(activeRide.ride);
          if (active) {
            setMatches(matchData);
          }
        }
      })
      .catch((err) => {
        console.error("Error restoring ride:", err);
      })
      .finally(() => {
        if (active) {
          setRestoring(false);
        }
      });

    return () => {
      active = false;
    };
  }, [user, trimmedName]);

  useEffect(() => {
    if (!currentRide?.id) {
      return undefined;
    }

    if (!["open", "pending"].includes(currentRide.status)) {
      return undefined;
    }

    const rideId = currentRide.id;

    const refresh = async () => {
      try {
        let ride = await getRide(rideId);
        const stillMember = (ride.members || []).some(
          (member) => member.name === trimmedName
        );

        // Other person left the pair — switch back to your own open ride.
        if (!stillMember && myRideId && myRideId !== ride.id) {
          ride = await getRide(myRideId);
        }

        setCurrentRide(ride);
        if (ride.status === "open" || ride.status === "pending") {
          setDestination((prev) =>
            prev && prev !== ride.destination ? prev : ride.destination
          );
        }

        if (ride.status === "open") {
          const matchData = await findMatches(ride);
          setMatches(matchData);
        } else if (ride.status === "cancelled") {
          setMatches([]);
          setCurrentRide(null);
          setMyRideId(null);
        } else {
          setMatches([]);
        }
      } catch (err) {
        console.error("Error refreshing ride:", err);
      }
    };

    const intervalId = setInterval(refresh, 2000);
    return () => clearInterval(intervalId);
  }, [currentRide?.id, currentRide?.status, myRideId, trimmedName]);

  const handleSignIn = async () => {
    setError("");
    setAuthLoading(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      console.error("Error signing in:", err);
      setError(err.message || "Could not sign in with Google.");
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    setError("");
    setAuthLoading(true);
    try {
      await signOut();
      setCurrentRide(null);
      setMyRideId(null);
      setMatches([]);
      setDestination("");
    } catch (err) {
      console.error("Error signing out:", err);
      setError(err.message || "Could not sign out.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!user) {
      setError("Please sign in with Google first.");
      return;
    }

    if (!trimmedName) {
      setError("Could not read your Google name. Try signing in again.");
      return;
    }

    if (!destination) {
      setError("Please choose a destination.");
      return;
    }

    if (isPaired) {
      setError("Leave the pair before changing your destination.");
      return;
    }

    setError("");
    setLoading(true);

    try {
      const ride = await upsertOpenRide({
        name: trimmedName,
        source: FIXED_ORIGIN,
        destination,
      });
      setCurrentRide(ride);
      setMyRideId(ride.id);
      setDestination(ride.destination);

      const matchData = await findMatches(ride);
      setMatches(matchData);
    } catch (err) {
      console.error("Error saving ride:", err);
      setError(
        err.message ||
          "Something went wrong. Check your Supabase .env keys and schema."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async (matchId) => {
    if (!currentRide) {
      return;
    }

    setError("");
    setJoiningId(matchId);

    try {
      const data = await joinRide(matchId, currentRide.id);
      setMatches([]);
      setCurrentRide(data);
    } catch (err) {
      console.error("Error joining ride:", err);
      setError(err.message || "Could not join that ride.");
    } finally {
      setJoiningId(null);
    }
  };

  const handleConfirm = async () => {
    if (!currentRide || !trimmedName) {
      return;
    }

    setError("");
    setConfirming(true);

    try {
      const data = await confirmRide(currentRide.id, trimmedName);
      setCurrentRide(data);
    } catch (err) {
      console.error("Error confirming ride:", err);
      setError(err.message || "Could not confirm.");
    } finally {
      setConfirming(false);
    }
  };

  const handleCancel = async () => {
    if (!currentRide || !trimmedName) {
      return;
    }

    setError("");
    setLeaving(true);

    try {
      await cancelRide(currentRide.id, trimmedName);
      setCurrentRide(null);
      setMyRideId(null);
      setMatches([]);
    } catch (err) {
      console.error("Error cancelling ride:", err);
      setError(err.message || "Could not cancel.");
    } finally {
      setLeaving(false);
    }
  };

  const handleLeavePair = async () => {
    if (!currentRide || !trimmedName) {
      return;
    }

    setError("");
    setLeaving(true);

    try {
      const restored = await leavePair(currentRide.id, trimmedName);
      setCurrentRide(restored);
      setMyRideId(restored.id);
      const matchData = await findMatches(restored);
      setMatches(matchData);
    } catch (err) {
      console.error("Error leaving pair:", err);
      setError(err.message || "Could not leave pair.");
    } finally {
      setLeaving(false);
    }
  };

  const handleStartOver = () => {
    setCurrentRide(null);
    setMyRideId(null);
    setMatches([]);
    setError("");
    setDestination("");
  };

  const partnerName =
    currentRide?.members?.find((member) => member.name !== trimmedName)
      ?.name || "your pair";

  if (!authReady) {
    return (
      <div className="container">
        <h1>RideMatch</h1>
        <p>Loading…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container">
        <h1>RideMatch</h1>
        <p>Leaving 292 Main · pair up for a ride.</p>

        <div className="ride-form auth-card">
          <p className="auth-card__copy">
            Sign in with Google to post or join a ride.
          </p>
          <button onClick={handleSignIn} disabled={authLoading}>
            {authLoading ? "Redirecting…" : "Sign in with Google"}
          </button>
          {error ? <p className="error">{error}</p> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="top-bar">
        <div>
          <h1>RideMatch</h1>
          <p>Leaving 292 Main · pair up for a ride.</p>
        </div>
        <div className="top-bar__user">
          <span className="top-bar__name">{trimmedName}</span>
          <button
            className="secondary-button top-bar__signout"
            onClick={handleSignOut}
            disabled={authLoading}
          >
            Sign out
          </button>
        </div>
      </div>

      <div className="ride-form">
        <label>From</label>
        <div className="origin-pill">{FIXED_ORIGIN}</div>

        <label>Destination</label>

        <select
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          disabled={isPaired}
        >
          <option value="" disabled>
            Select a destination
          </option>
          {DESTINATIONS.map((place) => (
            <option key={place} value={place}>
              {place}
            </option>
          ))}
        </select>

        <button
          onClick={handleSubmit}
          disabled={loading || isPaired || restoring || !destination}
        >
          {loading
            ? hasOpenRide
              ? "Updating..."
              : "Finding matches..."
            : destinationDirty
              ? "Update destination"
              : hasOpenRide
                ? "Refresh matches"
                : "Find Ride Matches"}
        </button>

        {hasOpenRide && !destinationDirty ? (
          <p className="form-hint">
            Change destination above to edit your open ride — we won&apos;t
            create a duplicate.
          </p>
        ) : null}

        {error ? <p className="error">{error}</p> : null}
      </div>

      {status === "locked" ? (
        <div className="matches paired locked locked-win">
          <div className="panel-header">
            <h2>You&apos;re locked in with {partnerName}</h2>
            <StatusChip status="locked" />
          </div>

          <div className="locked-win__route">
            <span className="locked-win__label">Going to</span>
            <strong className="locked-win__destination">
              {currentRide.destination}
            </strong>
            <span className="locked-win__from">From {FIXED_ORIGIN}</span>
          </div>

          <ul className="card-list">
            {currentRide.members.map((member) => (
              <li key={member.name} className="person-card">
                <div className="person-card__body">
                  <strong className="person-card__name">{member.name}</strong>
                  <span className="person-card__meta">Ready to go</span>
                </div>
                <span className="person-card__badge person-card__badge--done">
                  ✓ Confirmed
                </span>
              </li>
            ))}
          </ul>

          <p className="locked-win__note">Both confirmed — you&apos;re set.</p>

          <button className="secondary-button" onClick={handleStartOver}>
            Start over
          </button>
        </div>
      ) : null}

      {status === "pending" ? (
        <div className="matches paired">
          <div className="panel-header">
            <h2>Confirm your ride</h2>
            <StatusChip status="pending" />
          </div>
          <p className="empty">
            Pair found for {currentRide.destination}. Both people must confirm.
            Leaving will unpair both of you.
          </p>
          <ul className="card-list">
            {currentRide.members.map((member) => (
              <li key={member.name} className="person-card">
                <div className="person-card__body">
                  <strong className="person-card__name">{member.name}</strong>
                  <span className="person-card__meta">
                    {currentRide.destination}
                  </span>
                </div>
                <span
                  className={`person-card__badge ${
                    member.confirmed
                      ? "person-card__badge--done"
                      : "person-card__badge--wait"
                  }`}
                >
                  {member.confirmed ? "✓ Confirmed" : "Waiting"}
                </span>
              </li>
            ))}
          </ul>
          <button
            onClick={handleConfirm}
            disabled={confirming || leaving || iConfirmed}
          >
            {iConfirmed
              ? "Waiting for the other person..."
              : confirming
                ? "Confirming..."
                : "Confirm"}
          </button>
          <button
            className="secondary-button"
            onClick={handleLeavePair}
            disabled={leaving || confirming}
          >
            {leaving ? "Leaving..." : "Leave pair"}
          </button>
        </div>
      ) : null}

      {status === "open" && currentRide ? (
        <div className="matches">
          <div className="panel-header">
            <h2>Matches for {currentRide.destination}</h2>
            <StatusChip status="open" matchCount={matches.length} />
          </div>

          {matches.length === 0 ? (
            <div className="waiting-state">
              <span className="waiting-state__pulse" aria-hidden="true" />
              <div>
                <p className="waiting-state__title">You&apos;re on the board</p>
                <p className="waiting-state__copy">
                  Waiting for someone going to {currentRide.destination}. This
                  screen updates when they show up.
                </p>
              </div>
            </div>
          ) : (
            <ul className="card-list">
              {matches.map((match) => (
                <li key={match.id} className="person-card person-card--action">
                  <div className="person-card__body">
                    <strong className="person-card__name">{match.name}</strong>
                    <span className="person-card__meta">
                      {match.destination}
                    </span>
                  </div>
                  <button
                    className="join-button"
                    onClick={() => handleJoin(match.id)}
                    disabled={joiningId !== null || leaving}
                  >
                    {joiningId === match.id ? "Joining..." : "Join"}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button
            className="secondary-button"
            onClick={handleCancel}
            disabled={leaving || joiningId !== null}
          >
            {leaving ? "Cancelling..." : "Cancel my ride"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default App;
