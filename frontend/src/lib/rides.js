import { supabase } from "./supabase";

const MAX_RIDERS = 2;

function rpcErrorMessage(error) {
  return error?.message || "Something went wrong with Supabase.";
}

export async function createRide({ userId, name, source, destination }) {
  const { data, error } = await supabase
    .from("rides")
    .insert({
      user_id: userId,
      name,
      source,
      destination,
      status: "open",
      members: [{ name, user_id: userId, confirmed: false }],
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

export async function updateOpenRideDestination(rideId, destination) {
  const { data, error } = await supabase
    .from("rides")
    .update({ destination })
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
export async function upsertOpenRide({ userId, name, source, destination }) {
  if (!userId) {
    throw new Error("Sign in required to post a ride.");
  }

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
    if (keep.destination === destination) {
      return keep;
    }
    return updateOpenRideDestination(keep.id, destination);
  }

  return createRide({ userId, name, source, destination });
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

export async function findMatches(ride) {
  let query = supabase
    .from("rides")
    .select("*")
    .eq("status", "open")
    .eq("destination", ride.destination)
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
