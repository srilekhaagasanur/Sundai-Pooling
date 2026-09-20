import { useEffect, useState } from "react";
import "./App.css";
import {
  cancelRide,
  confirmRide,
  createRide,
  findMatches,
  getRide,
  joinRide,
  leavePair,
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
  const [name, setName] = useState("");
  const [destination, setDestination] = useState("");
  const [currentRide, setCurrentRide] = useState(null);
  const [myRideId, setMyRideId] = useState(null);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [joiningId, setJoiningId] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState("");

  const trimmedName = name.trim();
  const status = currentRide?.status;
  const isPaired = status === "pending" || status === "locked";
  const myMember = currentRide?.members?.find(
    (member) => member.name === trimmedName
  );
  const iConfirmed = Boolean(myMember?.confirmed);

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

  const handleSubmit = async () => {
    if (!trimmedName) {
      setError("Please enter your name.");
      return;
    }

    if (!destination) {
      setError("Please choose a destination.");
      return;
    }

    setError("");
    setLoading(true);
    setMatches([]);
    setCurrentRide(null);
    setMyRideId(null);

    try {
      const createdRide = await createRide({
        name: trimmedName,
        source: FIXED_ORIGIN,
        destination,
      });
      setCurrentRide(createdRide);
      setMyRideId(createdRide.id);

      const matchData = await findMatches(createdRide);
      setMatches(matchData);
    } catch (err) {
      console.error("Error finding matches:", err);
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

  return (
    <div className="container">
      <h1>RideMatch 🚗</h1>

      <p>Find students going your way.</p>

      <div className="ride-form">
        <label>Name</label>

        <input
          type="text"
          placeholder="Enter your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={isPaired}
        />

        <label>From</label>

        <input type="text" value={FIXED_ORIGIN} disabled />

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

        <button onClick={handleSubmit} disabled={loading || isPaired}>
          {loading ? "Finding matches..." : "Find Ride Matches"}
        </button>

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
            <p className="empty">
              No one else is going there yet. Your ride is posted — this screen
              updates when someone joins.
            </p>
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
