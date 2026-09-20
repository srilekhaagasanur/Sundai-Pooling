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
  const [loading, setLoading] = useState(false);
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
        />

        <label>From</label>

        <input type="text" value={FIXED_ORIGIN} disabled />

        <label>Destination</label>

        <select
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
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

        <button onClick={handleSubmit} disabled={loading}>
          {loading ? "Finding matches..." : "Find Ride Matches"}
        </button>

        {error ? <p className="error">{error}</p> : null}
      </div>

      {currentRide ? (
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
                <li key={match.id}>
                  <strong>{match.name}</strong>
                  <span>{match.destination}</span>
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
