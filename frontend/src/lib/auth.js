import { supabase } from "./supabase";

export function displayNameFromUser(user) {
  if (!user) {
    return "";
  }

  const meta = user.user_metadata || {};
  return (
    meta.full_name ||
    meta.name ||
    meta.preferred_username ||
    user.email?.split("@")[0] ||
    "Rider"
  );
}

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw error;
  }
  return data.session;
}

export function onAuthStateChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
  return data.subscription;
}

export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: window.location.origin,
    },
  });

  if (error) {
    throw error;
  }
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw error;
  }
}
