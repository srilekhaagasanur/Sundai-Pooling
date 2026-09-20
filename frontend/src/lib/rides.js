import { supabase } from "./supabase";

const MAX_RIDERS = 2;

function rpcErrorMessage(error) {
  return error?.message || "Something went wrong with Supabase.";
}

export async function createRide({ name, source, destination }) {
  const { data, error } = await supabase
    .from("rides")
    .insert({
      name,
      source,
      destination,
      status: "open",
      members: [{ name, confirmed: false }],
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

export async function findOpenRidesByName(name) {
  const { data, error } = await supabase
    .from("rides")
    .select("*")
    .eq("status", "open")
    .eq("name", name)
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

/**
 * Keep a single open ride per display name: reuse/update the newest open row,
 * cancel any older open duplicates, or create if none exist.
 * (Temporary until user_id lands in the schema.)
 */
export async function upsertOpenRide({ name, source, destination }) {
  const openRides = await findOpenRidesByName(name);
  const [keep, ...extras] = openRides;

  await Promise.all(
    extras.map(async (ride) => {
      try {
        await cancelRide(ride.id, name);
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

  return createRide({ name, source, destination });
}

/** Resume open/pending/joined state for this rider after refresh. */
export async function findActiveRideForRider(name) {
  const openRides = await findOpenRidesByName(name);
  if (openRides[0]) {
    return { ride: openRides[0], myRideId: openRides[0].id };
  }

  const { data: pendingRows, error: pendingError } = await supabase
    .from("rides")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (pendingError) {
    throw new Error(rpcErrorMessage(pendingError));
  }

  const pending = (pendingRows || []).find((ride) =>
    (ride.members || []).some((member) => member.name === name)
  );
  if (pending) {
    const mine = pending.name === name ? pending.id : null;
    const { data: joinedRow } = await supabase
      .from("rides")
      .select("id")
      .eq("status", "joined")
      .eq("name", name)
      .eq("joined_ride_id", pending.id)
      .maybeSingle();

    return {
      ride: pending,
      myRideId: mine || joinedRow?.id || pending.id,
    };
  }

  const { data: joinedRows, error: joinedError } = await supabase
    .from("rides")
    .select("*")
    .eq("status", "joined")
    .eq("name", name)
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

  return null;
}

export async function findMatches(ride) {
  const { data, error } = await supabase
    .from("rides")
    .select("*")
    .eq("status", "open")
    .eq("destination", ride.destination)
    .neq("id", ride.id)
    .order("created_at", { ascending: true });

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

export async function confirmRide(rideId, riderName) {
  const { data, error } = await supabase.rpc("confirm_ride", {
    ride_id: rideId,
    rider_name: riderName,
  });

  if (error) {
    throw new Error(rpcErrorMessage(error));
  }

  return data;
}

export async function cancelRide(rideId, riderName) {
  const { data, error } = await supabase.rpc("cancel_ride", {
    ride_id: rideId,
    rider_name: riderName,
  });

  if (error) {
    throw new Error(rpcErrorMessage(error));
  }

  return data;
}

export async function leavePair(pairRideId, riderName) {
  const { data, error } = await supabase.rpc("leave_pair", {
    pair_ride_id: pairRideId,
    rider_name: riderName,
  });

  if (error) {
    throw new Error(rpcErrorMessage(error));
  }

  return data;
}
