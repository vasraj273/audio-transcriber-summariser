import { supabase } from "./supabase";

export async function getUserAnalytics(userId) {
  if (!userId) {
    return { totalJobs: 0, completedJobs: 0, failedJobs: 0, totalMinutes: 0, totalCreditsSpent: 0, recent: [] };
  }

  const { data, error } = await supabase
    .from("transcripts")
    .select("id, status, duration_seconds, credits_used, audio_name, created_at, audio_type")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[Analytics] user aggregate failed:", error.message);
    return { totalJobs: 0, completedJobs: 0, failedJobs: 0, totalMinutes: 0, totalCreditsSpent: 0, recent: [] };
  }

  const rows = data || [];
  const completed = rows.filter((row) => (row.status || "completed") === "completed");
  const failed = rows.filter((row) => row.status === "failed");
  const totalSeconds = completed.reduce((acc, row) => acc + (row.duration_seconds || 0), 0);
  const totalCreditsSpent = completed.reduce((acc, row) => acc + (row.credits_used || 0), 0);

  return {
    totalJobs: rows.length,
    completedJobs: completed.length,
    failedJobs: failed.length,
    totalMinutes: Math.round(totalSeconds / 60),
    totalCreditsSpent,
    recent: completed.slice(0, 5),
  };
}

// Stub for future admin analytics. Requires a Supabase RPC + admin role
// (RLS would block this from running with a regular user JWT). Leaving the
// surface here so the UsagePage / future AdminPage can be wired without churn.
export async function getAdminAnalytics() {
  return {
    error: "admin_not_available",
    message: "Admin analytics requires server-side aggregation behind an admin role.",
    totalUsers: 0,
    totalJobs: 0,
    activeJobs: 0,
    failedJobs: 0,
    totalApiMinutes: 0,
  };
}
