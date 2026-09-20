import { useState } from "react";
import "./App.css";

const FIXED_ORIGIN = "292 Main St, Cambridge, MA 02142";

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
  const [departureTime, setDepartureTime] = useState("");

  const handleSubmit = async () => {
    if (!destination) {
      alert("Please choose a destination.");
      return;
    }

    const ride = {
      name: name,
      source: FIXED_ORIGIN,
      destination: destination,
      departure_time: departureTime,
    };

    try {
      const response = await fetch("http://127.0.0.1:8000/rides", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(ride),
      });

      const data = await response.json();

      console.log("Ride created:", data);

      alert("Ride created successfully!");
    } catch (error) {
      console.error("Error creating ride:", error);
      alert("Something went wrong.");
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

        <input
          type="text"
          value={FIXED_ORIGIN}
          disabled
        />

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

        <label>Departure Time</label>

        <input
          type="time"
          value={departureTime}
          onChange={(e) => setDepartureTime(e.target.value)}
        />

        <button onClick={handleSubmit}>
          Find Ride Matches
        </button>
      </div>
    </div>
  );
}

export default App;