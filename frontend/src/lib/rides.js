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
