import { createClient } from "@supabase/supabase-js";
import { request, ApiError } from "./client";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

export const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

export interface UserSession {
  email: string;
  name: string;
  role: string;
  token: string;
}

export const authApi = {
  login: async (email: string, password?: string): Promise<UserSession> => {
    // If real Supabase configured, attempt auth through the JS client
    if (supabase) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password: password || "",
      });
      if (error) throw new Error(error.message);
      const session: UserSession = {
        email: data.user?.email || email,
        name: data.user?.user_metadata?.name || email.split("@")[0],
        role: "Logistics Dispatcher",
        token: data.session?.access_token || "",
      };
      localStorage.setItem("routeiq_token", session.token);
      localStorage.setItem("routeiq_user", JSON.stringify(session));
      return session;
    }

    // Default enterprise local session
    const session: UserSession = {
      email,
      name: email.split("@")[0].toUpperCase() || "OPS CONTROLLER",
      role: "Logistics Mission Controller",
      token: "routeiq-ops-session-token",
    };
    localStorage.setItem("routeiq_token", session.token);
    localStorage.setItem("routeiq_user", JSON.stringify(session));
    return session;
  },

  logout: async () => {
    if (supabase) {
      await supabase.auth.signOut().catch(() => {});
    }
    localStorage.removeItem("routeiq_token");
    localStorage.removeItem("routeiq_user");
  },

  getCurrentUser: (): UserSession | null => {
    const raw = localStorage.getItem("routeiq_user");
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },

  /**
   * Verifies the stored session token against the backend.
   * Returns true when the session is valid, false on a definitive 401.
   * Network failures (backend offline) keep the session alive.
   */
  verifySession: async (token: string): Promise<boolean> => {
    if (!token) return false;
    try {
      const profile = await request<{ email: string; name: string; role: string }>("/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!profile?.email) return false;
      // Keep stored display data in sync with the verified profile
      const stored = authApi.getCurrentUser();
      if (stored && (stored.email !== profile.email || stored.name !== profile.name)) {
        const updated = { ...stored, ...profile };
        localStorage.setItem("routeiq_user", JSON.stringify(updated));
      }
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return false;
      return true; // network issue — do not log the user out
    }
  },
};