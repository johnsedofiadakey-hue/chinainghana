"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  onIdTokenChanged,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  type User,
} from "firebase/auth";
import { doc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import { auth, db, STAFF_EMAIL_DOMAIN } from "@/lib/firebase";
import type { Role, StaffUser } from "@/lib/types";

interface AuthState {
  user: User | null;
  role: Role | null;
  branchId: string | null;
  profile: StaffUser | null;
  loading: boolean;
  signIn: (username: string, password: string) => Promise<Role | null>;
  signOut: () => Promise<void>;
  changePassword: (current: string, next: string) => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function usernameToEmail(username: string): string {
  const u = username.trim().toLowerCase();
  return u.includes("@") ? u : `${u}@${STAFF_EMAIL_DOMAIN}`;
}

export function homeForRole(role: Role | null): string {
  if (role === "superadmin") return "/super";
  if (role === "admin") return "/admin";
  if (role === "manager") return "/manager";
  return "/";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [profile, setProfile] = useState<StaffUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onIdTokenChanged(auth, async (u) => {
      setUser(u);
      if (!u) {
        setRole(null);
        setBranchId(null);
        setProfile(null);
        setLoading(false);
        return;
      }
      const token = await u.getIdTokenResult();
      setRole((token.claims.role as Role | undefined) ?? null);
      setBranchId((token.claims.branchId as string | undefined) ?? null);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!user || !role) {
      setProfile(null);
      return;
    }
    return onSnapshot(
      doc(db, "users", user.uid),
      (snap) => setProfile(snap.exists() ? ({ id: snap.id, ...snap.data() } as StaffUser) : null),
      () => setProfile(null),
    );
  }, [user, role]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      role,
      branchId,
      profile,
      loading,
      async signIn(username, password) {
        const cred = await signInWithEmailAndPassword(auth, usernameToEmail(username), password);
        const token = await cred.user.getIdTokenResult(true);
        return (token.claims.role as Role | undefined) ?? null;
      },
      async signOut() {
        await fbSignOut(auth);
      },
      async changePassword(current, next) {
        const u = auth.currentUser;
        if (!u?.email) throw new Error("Not signed in.");
        await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, current));
        await updatePassword(u, next);
        await updateDoc(doc(db, "users", u.uid), { mustChangePassword: false, updatedAt: serverTimestamp() });
      },
    }),
    [user, role, branchId, profile, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
