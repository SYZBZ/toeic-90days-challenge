import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { importLegacyLocalData, saveUserKey } from "../lib/firestoreService";

export default function SettingsPage() {
  const { user, profile, refreshProfile, signOut } = useAuth();
  const [apiKey, setApiKey] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setApiKey(profile?.geminiApiKey || "");
  }, [profile?.geminiApiKey]);

  const onSave = async () => {
    setSaving(true);
    setMessage("");
    try {
      await saveUserKey(user.uid, apiKey.trim());
      await refreshProfile(user.uid);
      setMessage("已儲存，其他裝置登入後會自動同步。", "");
    } catch (err) {
      setMessage(err.message || "儲存失敗");
    } finally {
      setSaving(false);
    }
  };

  const onImport = async () => {
    setSaving(true);
    setMessage("");
    try {
      const result = await importLegacyLocalData(user.uid);
      await refreshProfile(user.uid);
      setMessage(`匯入完成：history ${result.importedHistory} 筆、mistakes ${result.importedMistakes} 筆`);
    } catch (err) {
      setMessage(err.message || "匯入失敗");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="stack">
      <section className="card">
        <h3>Gemini API Key（跨裝置同步）</h3>
        <label>GEMINI_API_KEY</label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="AIza..."
        />
        <div className="row">
          <button className="btn primary" onClick={onSave} disabled={saving}>儲存 Key</button>
          <button className="btn" onClick={onImport} disabled={saving}>匯入舊版 localStorage</button>
        </div>
        <p className="muted">僅儲存在你的 users/{user.uid}，不會公開給其他人。</p>
        {message && <p className="alert">{message}</p>}
      </section>

      <section className="card">
        <h3>帳號</h3>
        <p className="muted">{user?.email}</p>
        <button className="btn danger" onClick={signOut}>登出</button>
      </section>
    </div>
  );
}
