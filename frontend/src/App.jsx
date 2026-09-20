import { useEffect, useState } from "react";
import "./App.css";

const FIXED_ORIGIN = "292 Main St, Cambridge, MA 02142";
const API_BASE = "http://127.0.0.1:8000";

const DESTINATIONS = [
  "Ashdown House - 235 Albany St",
  "84 Mass Ave",
  "Harvard Business School - 111 Western Avenue, Boston, MA 02163",
  "Northeastern University - 360 Huntington Avenue, Boston, MA 02115",
  "Central Square in Cambridge",
];

function App() {
  const [name, setName] = useState("");
  const [destination, setDestination] = useState("");
  const [currentRide, setCurrentRide] = useState(null);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [joiningId, setJoiningId] = useState(null);
  const [confirming, setConfirming] = useState(false);
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
        const response = await fetch(`${API_BASE}/rides/${rideId}`);
        if (!response.ok) {
          return;
        }

        const ride = await response.json();
        setCurrentRide(ride);

        if (ride.status === "open") {
          const matchesResponse = await fetch(
            `${API_BASE}/rides/${ride.id}/matches`
          );
          if (matchesResponse.ok) {
            const matchData = await matchesResponse.json();
            setMatches(Array.isArray(matchData) ? matchData : []);
          }
        } else {
          setMatches([]);
        }
      } catch (err) {
        console.error("Error refreshing ride:", err);
      }
    };

    const intervalId = setInterval(refresh, 2000);
    return () => clearInterval(intervalId);
  }, [currentRide?.id, currentRide?.status]);

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

    const ride = {
      name: trimmedName,
      source: FIXED_ORIGIN,
      destination: destination,
    };

    try {
      const createResponse = await fetch(`${API_BASE}/rides`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(ride),
      });

      if (!createResponse.ok) {
        throw new Error("Could not create ride.");
      }

      const createdRide = await createResponse.json();
      setCurrentRide(createdRide);

      const matchesResponse = await fetch(
        `${API_BASE}/rides/${createdRide.id}/matches`
      );

      if (!matchesResponse.ok) {
        throw new Error("Could not load matches.");
      }

      const matchData = await matchesResponse.json();
      setMatches(Array.isArray(matchData) ? matchData : []);
    } catch (err) {
      console.error("Error finding matches:", err);
      setError("Something went wrong. Is the backend running?");
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
      const response = await fetch(`${API_BASE}/rides/${matchId}/join`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ joiner_ride_id: currentRide.id }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Could not join ride.");
      }

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
      const response = await fetch(
        `${API_BASE}/rides/${currentRide.id}/confirm`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name: trimmedName }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Could not confirm ride.");
      }

      setCurrentRide(data);
    } catch (err) {
      console.error("Error confirming ride:", err);
      setError(err.message || "Could not confirm.");
    } finally {
      setConfirming(false);
    }
  };

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
        <div className="matches paired locked">
          <h2>You&apos;re locked in!</h2>
          <p className="empty">
            Both confirmed. Going together to {currentRide.destination}.
          </p>
          <ul>
            {currentRide.members.map((member) => (
              <li key={member.name}>
                <strong>{member.name}</strong>
                <span>Confirmed</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {status === "pending" ? (
        <div className="matches paired">
          <h2>Confirm your ride</h2>
          <p className="empty">
            Pair found for {currentRide.destination}. Both people must confirm.
          </p>
          <ul>
            {currentRide.members.map((member) => (
              <li key={member.name} className="match-row">
                <div>
                  <strong>{member.name}</strong>
                  <span>
                    {member.confirmed ? "Confirmed" : "Waiting to confirm"}
                  </span>
                </div>
              </li>
            ))}
          </ul>
          <button
            onClick={handleConfirm}
            disabled={confirming || iConfirmed}
          >
            {iConfirmed
              ? "Waiting for the other person..."
              : confirming
                ? "Confirming..."
                : "Confirm"}
          </button>
        </div>
      ) : null}

      {status === "open" && currentRide ? (
        <div className="matches">
          <h2>Matches for {currentRide.destination}</h2>

          {matches.length === 0 ? (
            <p className="empty">
              No one else is going there yet. Your ride is posted — this screen
              updates when someone joins.
            </p>
          ) : (
            <ul>
              {matches.map((match) => (
                <li key={match.id} className="match-row">
                  <div>
                    <strong>{match.name}</strong>
                    <span>{match.destination}</span>
                  </div>
                  <button
                    className="join-button"
                    onClick={() => handleJoin(match.id)}
                    disabled={joiningId !== null}
                  >
                    {joiningId === match.id ? "Joining..." : "Join"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default App;
