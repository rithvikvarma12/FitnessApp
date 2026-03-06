import { supabase } from "./supabase";

export async function signUp(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  // Create the remote profile row keyed by Supabase auth user id
  if (data.user) {
    const { error: profileError } = await supabase
      .from("user_profiles")
      .insert({ auth_id: data.user.id });
    if (profileError) throw profileError;
  }
  return data;
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}
