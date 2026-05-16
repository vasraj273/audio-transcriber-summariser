import { supabase } from "./supabase";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;

async function adminFetch(path, options = {}) {
  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;
  if (!token) throw new Error("Not signed in.");

  const response = await fetch(`${BACKEND_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });

  if (response.status === 403) {
    const error = new Error("Forbidden");
    error.code = "forbidden";
    throw error;
  }
  if (response.status === 401) {
    const error = new Error("Unauthorized");
    error.code = "unauthorized";
    throw error;
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || `Admin request failed (${response.status}).`);
  }
  return response.json();
}

export async function checkAdmin(userId) {
  if (!userId) {
    console.info("[Admin.svc] checkAdmin: no userId");
    return false;
  }

  // Preferred path: SECURITY DEFINER RPC. Bypasses RLS on admin_users so
  // there's no recursion risk and no own-row policy required.
  try {
    const { data, error } = await supabase.rpc("is_admin", { uid: userId });
    if (!error) {
      console.info("[Admin.svc] is_admin RPC returned", { data });
      return Boolean(data);
    }
    console.warn("[Admin.svc] is_admin RPC failed, falling back to direct select:", error.message);
  } catch (err) {
    console.warn("[Admin.svc] is_admin RPC threw, falling back:", err?.message || err);
  }

  // Fallback path for environments where the RPC has not been created yet.
  // Requires the "users_read_own_admin_status" policy from supabase_admin_rls_fix.sql.
  try {
    const { data, error } = await supabase
      .from("admin_users")
      .select("user_id")
      .eq("user_id", userId)
      .limit(1);
    if (error) {
      console.warn("[Admin.svc] direct admin_users select failed:", error.message);
      return false;
    }
    const isAdmin = Array.isArray(data) && data.length > 0;
    console.info("[Admin.svc] direct select result", { rows: data?.length, isAdmin });
    return isAdmin;
  } catch (err) {
    console.warn("[Admin.svc] direct select threw:", err?.message || err);
    return false;
  }
}

export function getOverview() {
  return adminFetch("/admin/overview");
}

export function listUsers({ search = "", plan = "", status = "" } = {}) {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (plan) params.set("plan", plan);
  if (status) params.set("status", status);
  const query = params.toString();
  return adminFetch(`/admin/users${query ? `?${query}` : ""}`);
}

export function getUserDetail(userId) {
  return adminFetch(`/admin/users/${userId}`);
}

export function adjustCredits(userId, mode, amount) {
  return adminFetch(`/admin/users/${userId}/credits`, {
    method: "POST",
    body: JSON.stringify({ mode, amount }),
  });
}

export function suspendUser(userId) {
  return adminFetch(`/admin/users/${userId}/suspend`, { method: "POST" });
}

export function unsuspendUser(userId) {
  return adminFetch(`/admin/users/${userId}/unsuspend`, { method: "POST" });
}

export function deleteUser(userId) {
  return adminFetch(`/admin/users/${userId}`, { method: "DELETE" });
}

export function listFailedJobs() {
  return adminFetch("/admin/failed-jobs");
}

export function deleteFailedJob(jobId) {
  return adminFetch(`/admin/failed-jobs/${jobId}`, { method: "DELETE" });
}

export function retryFailedJob(jobId) {
  return adminFetch(`/admin/failed-jobs/${jobId}/retry`, { method: "POST" });
}

export function getSettings() {
  return adminFetch("/admin/settings");
}

export function updateSetting(key, value) {
  return adminFetch(`/admin/settings/${key}`, {
    method: "PUT",
    body: JSON.stringify({ value }),
  });
}

export function getApiMonitoring() {
  return adminFetch("/admin/api-monitoring");
}

export function getAnalytics() {
  return adminFetch("/admin/analytics");
}
