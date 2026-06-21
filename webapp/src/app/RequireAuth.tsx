import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useApp } from "./AppContext";

export default function RequireAuth({ children }: { children: ReactNode }) {
  const app = useApp();
  if (!app.token) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}
