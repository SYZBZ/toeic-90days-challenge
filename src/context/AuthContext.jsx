import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { auth, firebaseIsConfigured, firebaseMissingKeys } from "../lib/firebase";
import { normalizeAiSettings } from "../lib/aiModels";
import { ensureUserProfile, loadUserProfile } from "../lib/firestoreService";

const AuthContext = createContext(null);

function configErrorMessage() {
  if (firebaseIsConfigured) return "";
  return `Firebase 尚未設定完成，缺少：${firebaseMissingKeys.join(", ")}`;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = async (uid) => {
    if (!uid || !firebaseIsConfigured) return null;
    const next = await loadUserProfile(uid);
    setProfile(next);
    localStorage.setItem("toeic.ai.settings", JSON.stringify(normalizeAiSettings(next?.settings?.ai || {})));
    return next;
  };

  useEffect(() => {
    if (!firebaseIsConfigured || !auth) {
      setLoading(false);
      return () => {};
    }

    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);

      if (nextUser) {
        await ensureUserProfile(nextUser.uid, nextUser.email || "");
        await refreshProfile(nextUser.uid);
      } else {
        setProfile(null);
        localStorage.setItem("toeic.ai.settings", JSON.stringify(normalizeAiSettings()));
      }

      setLoading(false);
    });

    return () => unsub();
  }, []);

  const guard = () => {
    if (!firebaseIsConfigured || !auth) {
      throw new Error(configErrorMessage());
    }
  };

  const value = useMemo(() => ({
    user,
    profile,
    loading,
    configError: configErrorMessage(),
    firebaseReady: firebaseIsConfigured,
    refreshProfile,
    signIn: async (email, password) => {
      guard();
      return signInWithEmailAndPassword(auth, email, password);
    },
    signUp: async (email, password) => {
      guard();
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await ensureUserProfile(cred.user.uid, cred.user.email || email);
      await refreshProfile(cred.user.uid);
      return cred;
    },
    signOut: async () => {
      guard();
      return signOut(auth);
    },
    resetPassword: async (email) => {
      guard();
      return sendPasswordResetEmail(auth, email);
    },
  }), [user, profile, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth 必須在 AuthProvider 內使用");
  return ctx;
}
