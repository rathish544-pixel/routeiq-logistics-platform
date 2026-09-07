import React, { createContext, useContext, useEffect, useState } from "react";
import { authApi } from "../api/auth";
import type { UserSession } from "../api/auth";

interface AuthContextType {
  user: UserSession | null;
  loading: boolean;
  login: (email: string, password?: string) => Promise<UserSession>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const savedUser = authApi.getCurrentUser();
    if (savedUser) {
      setUser(savedUser);
      // Verify the stored session against the backend (offline-tolerant)
      authApi.verifySession(savedUser.token).then((valid) => {
        if (!valid) {
          authApi.logout().then(() => setUser(null));
        }
      });
    }
    setLoading(false);
  }, []);

  // Global 401 handler: any API response with an invalid session signs the user out
  useEffect(() => {
    const handleUnauthorized = () => {
      authApi.logout().then(() => setUser(null));
    };
    window.addEventListener("routeiq:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("routeiq:unauthorized", handleUnauthorized);
  }, []);

  const login = async (email: string, password?: string) => {
    setLoading(true);
    try {
      const session = await authApi.login(email, password);
      setUser(session);
      return session;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    await authApi.logout();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
