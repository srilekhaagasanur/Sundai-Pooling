import { supabase } from "./supabase";
import { rankMatches, rankMatchesHybrid } from "./matching";

const MAX_RIDERS = 2;

function rpcErrorMessage(error) {
  return error?.message || "Something went wrong with Supabase.";
}

export async function createRide({
  userId,
  name,
  source,
  destination,
  placeId = null,
  destLat = null,
  destLng = null,
}) {
  const { data, error } = await supabase
    .from("rides")
    .insert({
      user_id: userId,
      name,
      source,
      destination,
      place_id: placeId,
      dest_lat: destLat,
      dest_lng: destLng,
      status: "open",
      members: [
        {
          name,
          user_id: userId,
          confirmed: false,
          destination,
          dest_lat: destLat,
          dest_lng: destLng,
          place_id: placeId,
        },
      ],
    })
    .select()
    .single();

  if (error) {
    throw new Error(rpcErrorMessage(error));
  }

  return data;
}

export async function getRide(rideId) {
  const { data, error } = await supabase
    .from("rides")
    .select("*")
    .eq("id", rideId)
    .single();

  if (error) {
    throw new Error(rpcErrorMessage(error));
  }

  return data;
}

export async function findOpenRidesByUserId(userId) {
  const { data, error } = await supabase
    .from("rides")
    .select("*")
    .eq("status", "open")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(rpcErrorMessage(error));
  }

  return data || [];
}

export async function updateOpenRideDestination(
  rideId,
  {
    destination,
    placeId = null,
    destLat = null,
    destLng = null,
    name = null,
    userId = null,
  }
) {
  const patch = {
    destination,
    place_id: placeId,
    dest_lat: destLat,
    dest_lng: destLng,
  };

  if (name || userId) {
    patch.members = [
      {
        name,
        user_id: userId,
        confirmed: false,
        destination,
        dest_lat: destLat,
        dest_lng: destLng,
        place_id: placeId,
      },
    ];
  }

  const { data, error } = await supabase
    .from("rides")
    .update(patch)
    .eq("id", rideId)
    .eq("status", "open")
    .select()
    .single();

  if (error) {
    throw new Error(rpcErrorMessage(error));
  }

  return data;
}

/** Keep a single open ride per Google user; update destination in place. */
export async function upsertOpenRide({
  userId,
  name,
  source,
  destination,
  placeId = null,
  destLat = null,
  destLng = null,
}) {
  if (!userId) {
    throw new Error("Sign in required to post a ride.");
  }

  const payload = {
    userId,
    name,
    source,
    destination,
    placeId,
    destLat,
    destLng,
  };

  // Prefer atomic RPC when available; fall back if schema cache hasn't picked it up.
  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "upsert_open_ride",
    {
      p_user_id: userId,
      p_name: name,
      p_source: source,
      p_destination: destination,
      p_place_id: placeId,
      p_dest_lat: destLat,
      p_dest_lng: destLng,
    }
  );

  if (!rpcError) {
    return rpcData;
  }

  const missingRpc =
    /could not find the function/i.test(rpcError.message || "") ||
    rpcError.code === "PGRST202";

  if (!missingRpc) {
    throw new Error(rpcErrorMessage(rpcError));
  }

  return upsertOpenRideClient(payload);
}

async function upsertOpenRideClient({
  userId,
  name,
  source,
  destination,
  placeId,
  destLat,
  destLng,
}) {
  const openRides = await findOpenRidesByUserId(userId);
  const [keep, ...extras] = openRides;

  await Promise.all(
    extras.map(async (ride) => {
      try {
        await cancelRide(ride.id, userId);
      } catch (err) {
        console.error("Error cancelling duplicate open ride:", err);
      }
    })
  );

  if (keep) {
    return updateOpenRideDestination(keep.id, {
      destination,
      placeId,
      destLat,
      destLng,
      name,
      userId,
    });
  }

  try {
    return await createRide({
      userId,
      name,
      source,
      destination,
      placeId,
      destLat,
      destLng,
    });
  } catch (err) {
    const msg = err?.message || "";
    if (!/rides_one_open_per_user|duplicate key/i.test(msg)) {
      throw err;
    }

    // Race: another tab/request created the open row first — update it.
    const again = await findOpenRidesByUserId(userId);
    if (!again[0]) {
      throw err;
    }
    return updateOpenRideDestination(again[0].id, {
      destination,
      placeId,
      destLat,
      destLng,
      name,
      userId,
    });
  }
}

/** Resume open/pending/joined state for this signed-in user after refresh. */
export async function findActiveRideForRider({ userId, name }) {
  if (!userId) {
    return null;
  }

  const openRides = await findOpenRidesByUserId(userId);
  if (openRides[0]) {
    return { ride: openRides[0], myRideId: openRides[0].id };
  }

  const { data: pendingOwned, error: pendingOwnedError } = await supabase
    .from("rides")
    .select("*")
    .eq("status", "pending")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (pendingOwnedError) {
    throw new Error(rpcErrorMessage(pendingOwnedError));
  }

  if (pendingOwned?.[0]) {
    return { ride: pendingOwned[0], myRideId: pendingOwned[0].id };
  }

  const { data: joinedRows, error: joinedError } = await supabase
    .from("rides")
    .select("*")
    .eq("status", "joined")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (joinedError) {
    throw new Error(rpcErrorMessage(joinedError));
  }

  const joined = joinedRows?.[0];
  if (joined?.joined_ride_id) {
    const pair = await getRide(joined.joined_ride_id);
    // Locked/cancelled trips are finished — don't pull them back after Start over.
    if (pair.status === "locked" || pair.status === "cancelled") {
      return null;
    }
    return { ride: pair, myRideId: joined.id };
  }

  // Legacy fallback: rows created before user_id existed
  if (name) {
    const { data: legacyOpen, error: legacyError } = await supabase
      .from("rides")
      .select("*")
      .eq("status", "open")
      .eq("name", name)
      .is("user_id", null)
      .order("created_at", { ascending: false })
      .limit(1);

    if (legacyError) {
      throw new Error(rpcErrorMessage(legacyError));
    }

    if (legacyOpen?.[0]) {
      return { ride: legacyOpen[0], myRideId: legacyOpen[0].id };
    }
  }

  return null;
}

/** Mark a finished locked trip so it won't resurrect; cancels the caller's joined row if any. */
export async function dismissFinishedRide({ userId, ride, myRideId }) {
  if (!userId || !ride) {
    return;
  }

  // Joiner still has a `joined` row pointing at the locked pair — close it out.
  if (myRideId && myRideId !== ride.id) {
    const { error } = await supabase
      .from("rides")
      .update({ status: "cancelled" })
      .eq("id", myRideId)
      .eq("user_id", userId)
      .eq("status", "joined");

    if (error) {
      console.error("Error dismissing joined ride:", error);
    }
  }
}

/** Open rides that could be joined (no ranking). */
export async function listOpenCandidates(ride) {
  let query = supabase
    .from("rides")
    .select("*")
    .eq("status", "open")
    .neq("id", ride.id)
    .order("created_at", { ascending: true });

  if (ride.user_id) {
    query = query.neq("user_id", ride.user_id);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(rpcErrorMessage(error));
  }

  return (data || []).filter(
    (match) => Array.isArray(match.members) && match.members.length < MAX_RIDERS
  );
}

/** All open rides with a free seat (for guest board / previews). */
export async function listOpenRides() {
  const { data, error } = await supabase
    .from("rides")
    .select(
      "id, name, destination, dest_lat, dest_lng, place_id, created_at, members, status, user_id"
    )
    .eq("status", "open")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(rpcErrorMessage(error));
  }

  return (data || []).filter(
    (ride) => Array.isArray(ride.members) && ride.members.length < MAX_RIDERS
  );
}

export async function countOpenRides() {
  const open = await listOpenRides();
  return open.length;
}

/**
 * Guest / pre-login preview: rank open rides near a destination.
 */
export async function previewMatchesForDestination({
  destination,
  placeId = null,
  destLat = null,
  destLng = null,
}) {
  const candidates = await listOpenRides();
  const probe = {
    id: -1,
    destination,
    place_id: placeId,
    dest_lat: destLat,
    dest_lng: destLng,
  };
  return rankMatchesHybrid(probe, candidates);
}

/**
 * Rank nearby open rides: haversine shortlist, then ORS road matrix when available.
 * Pass scorer only to force pure haversine (tests / offline).
 */
export async function findMatches(ride, scorer = null) {
  const candidates = await listOpenCandidates(ride);
  if (scorer) {
    return rankMatches(ride, candidates, scorer);
  }
  return rankMatchesHybrid(ride, candidates);
}

export async function joinRide(targetId, joinerRideId) {
  const { data, error } = await supabase.rpc("join_ride", {
    target_id: targetId,
    joiner_id: joinerRideId,
  });

  if (error) {
    throw new Error(rpcErrorMessage(error));
  }

  return data;
}

export async function confirmRide(rideId, riderUserId) {
  const { data, error } = await supabase.rpc("confirm_ride", {
    ride_id: rideId,
    rider_user_id: riderUserId,
  });

  if (error) {
    throw new Error(rpcErrorMessage(error));
  }

  return data;
}

export async function cancelRide(rideId, riderUserId) {
  const { data, error } = await supabase.rpc("cancel_ride", {
    ride_id: rideId,
    rider_user_id: riderUserId,
  });

  if (error) {
    throw new Error(rpcErrorMessage(error));
  }

  return data;
}

export async function leavePair(pairRideId, riderUserId) {
  const { data, error } = await supabase.rpc("leave_pair", {
    pair_ride_id: pairRideId,
    rider_user_id: riderUserId,
  });

  if (error) {
    throw new Error(rpcErrorMessage(error));
  }

  return data;
}
