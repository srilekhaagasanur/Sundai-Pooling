import { useState } from "react";
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
  const [pairedRide, setPairedRide] = useState(null);
  const [loading, setLoading] = useState(false);
  const [joiningId, setJoiningId] = useState(null);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!name.trim()) {
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
    setPairedRide(null);

    const ride = {
      name: name.trim(),
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

      setPairedRide(data);
      setMatches([]);
      setCurrentRide(data);
    } catch (err) {
      console.error("Error joining ride:", err);
      setError(err.message || "Could not join that ride.");
    } finally {
      setJoiningId(null);
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
          disabled={Boolean(pairedRide)}
        />

        <label>From</label>

        <input type="text" value={FIXED_ORIGIN} disabled />

        <label>Destination</label>

        <select
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          disabled={Boolean(pairedRide)}
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
          disabled={loading || Boolean(pairedRide)}
        >
          {loading ? "Finding matches..." : "Find Ride Matches"}
        </button>

        {error ? <p className="error">{error}</p> : null}
      </div>

      {pairedRide ? (
        <div className="matches paired">
          <h2>You&apos;re paired!</h2>
          <p className="empty">
            Going together to {pairedRide.destination} (2 people max).
          </p>
          <ul>
            {pairedRide.members.map((member) => (
              <li key={member}>
                <strong>{member}</strong>
                <span>{pairedRide.destination}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!pairedRide && currentRide ? (
        <div className="matches">
          <h2>Matches for {currentRide.destination}</h2>

          {matches.length === 0 ? (
            <p className="empty">
              No one else is going there yet. Your ride is posted — check back
              when others join.
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
