from fastapi import FastAPI
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

rides = []


class Ride(BaseModel):
    name: str
    source: str
    destination: str


@app.get("/")
def home():
    return {
        "message": "RideMatch backend is running"
    }


@app.post("/rides")
def create_ride(ride: Ride):

    ride_data = ride.model_dump()

    ride_data["id"] = len(rides) + 1

    rides.append(ride_data)

    return ride_data


@app.get("/rides")
def get_rides():
    return rides


@app.get("/rides/{ride_id}/matches")
def find_matches(ride_id: int):

    current_ride = None

    for ride in rides:

        if ride["id"] == ride_id:
            current_ride = ride
            break


    if current_ride is None:

        return {
            "error": "Ride not found"
        }


    matches = []


    for ride in rides:

        if ride["id"] == ride_id:
            continue


        if ride["destination"] == current_ride["destination"]:

            matches.append(ride)


    return matches