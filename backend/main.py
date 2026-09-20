from fastapi import FastAPI, HTTPException
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

MAX_RIDERS = 2
rides = []


class Ride(BaseModel):
    name: str
    source: str
    destination: str


class JoinRequest(BaseModel):
    joiner_ride_id: int


class ConfirmRequest(BaseModel):
    name: str


def get_ride(ride_id: int):
    for ride in rides:
        if ride["id"] == ride_id:
            return ride
    return None


def all_confirmed(ride):
    return len(ride["members"]) == MAX_RIDERS and all(
        member["confirmed"] for member in ride["members"]
    )


@app.get("/")
def home():
    return {
        "message": "RideMatch backend is running"
    }


@app.post("/rides")
def create_ride(ride: Ride):
    ride_data = ride.model_dump()
    ride_data["id"] = len(rides) + 1
    ride_data["status"] = "open"
    ride_data["members"] = [{"name": ride.name, "confirmed": False}]
    rides.append(ride_data)
    return ride_data


@app.get("/rides")
def get_rides():
    return rides


@app.get("/rides/{ride_id}")
def read_ride(ride_id: int):
    ride = get_ride(ride_id)

    if ride is None:
        raise HTTPException(status_code=404, detail="Ride not found")

    return ride


@app.get("/rides/{ride_id}/matches")
def find_matches(ride_id: int):
    current_ride = get_ride(ride_id)

    if current_ride is None:
        raise HTTPException(status_code=404, detail="Ride not found")

    if current_ride["status"] != "open":
        return []

    matches = []

    for ride in rides:
        if ride["id"] == ride_id:
            continue

        if ride["status"] != "open":
            continue

        if ride["destination"] != current_ride["destination"]:
            continue

        if len(ride["members"]) >= MAX_RIDERS:
            continue

        matches.append(ride)

    return matches


@app.post("/rides/{ride_id}/join")
def join_ride(ride_id: int, body: JoinRequest):
    target_ride = get_ride(ride_id)
    joiner_ride = get_ride(body.joiner_ride_id)

    if target_ride is None:
        raise HTTPException(status_code=404, detail="Ride not found")

    if joiner_ride is None:
        raise HTTPException(status_code=404, detail="Your ride was not found")

    if ride_id == body.joiner_ride_id:
        raise HTTPException(status_code=400, detail="Cannot join your own ride")

    if target_ride["status"] != "open" or joiner_ride["status"] != "open":
        raise HTTPException(status_code=400, detail="Ride is no longer available")

    if target_ride["destination"] != joiner_ride["destination"]:
        raise HTTPException(status_code=400, detail="Destinations do not match")

    if len(target_ride["members"]) >= MAX_RIDERS:
        raise HTTPException(status_code=400, detail="Ride is full")

    target_ride["members"].append(
        {"name": joiner_ride["name"], "confirmed": False}
    )
    target_ride["status"] = "pending"
    joiner_ride["status"] = "joined"
    joiner_ride["joined_ride_id"] = target_ride["id"]

    return target_ride


@app.post("/rides/{ride_id}/confirm")
def confirm_ride(ride_id: int, body: ConfirmRequest):
    ride = get_ride(ride_id)

    if ride is None:
        raise HTTPException(status_code=404, detail="Ride not found")

    if ride["status"] not in ("pending", "locked"):
        raise HTTPException(status_code=400, detail="Ride is not ready to confirm")

    member = next(
        (item for item in ride["members"] if item["name"] == body.name),
        None,
    )

    if member is None:
        raise HTTPException(status_code=400, detail="You are not part of this ride")

    member["confirmed"] = True

    if all_confirmed(ride):
        ride["status"] = "locked"

    return ride
