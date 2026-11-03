"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Server actions: functions that run on the server when a form is
 * submitted. The browser never sees the password check itself.
 */

function readCredentials(formData: FormData) {
  return {
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  };
}

export async function signIn(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(readCredentials(formData));
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);
  redirect("/");
}

export async function signUp(formData: FormData) {
  const credentials = readCredentials(formData);
  if (credentials.password.length < 8) {
    redirect(`/login?error=${encodeURIComponent("Use a password of at least 8 characters.")}`);
  }
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp(credentials);
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);
  if (!data.session) {
    redirect(`/login?message=${encodeURIComponent("Check your email to confirm the login, then sign in.")}`);
  }
  redirect("/setup");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
