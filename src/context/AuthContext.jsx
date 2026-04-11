import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { auth } from "../lib/firebase";
import { ensureUserProfile, loadUserProfile } from "../lib/firestoreService";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = async (uid) => {
    if (!uid) return null;
    const p = await loadUserProfile(uid);
    setProfile(p);
    return p;
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      if (nextUser) {
        await ensureUserProfile(nextUser.uid, nextUser.email || "");
        await refreshProfile(nextUser.uid);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const value = useMemo(() => ({
    user,
    profile,
    loading,
    refreshProfile,
    signIn: (email, password) => signInWithEmailAndPassword(auth, email, password),
    signUp: async (email, password) => {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await ensureUserProfile(cred.user.uid, cred.user.email || email);
      await refreshProfile(cred.user.uid);
      return cred;
    },
    signOut: () => signOut(auth),
    resetPassword: (email) => sendPasswordResetEmail(auth, email),
  }), [user, profile, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth 必須在 AuthProvider 內使用");
  return ctx;
}
