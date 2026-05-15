import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { checkAdmin } from "../services/admin";

const AdminContext = createContext(null);

export function AdminProvider({ userId, children }) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) {
      setIsAdmin(false);
      setChecked(true);
      return;
    }
    setLoading(true);
    try {
      const result = await checkAdmin();
      setIsAdmin(Boolean(result));
    } catch {
      setIsAdmin(false);
    } finally {
      setLoading(false);
      setChecked(true);
    }
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo(() => ({ isAdmin, loading, checked, refresh }), [isAdmin, loading, checked, refresh]);
  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdmin() {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdmin must be used inside AdminProvider");
  return ctx;
}
