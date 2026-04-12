import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { DEFAULT_AI_SETTINGS, normalizeAiSettings } from "../lib/aiModels";
import { probeModelAvailability } from "../lib/geminiService";
import { importLegacyLocalData, saveUserKey } from "../lib/firestoreService";
import { Banner } from "../ui/Banner";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { InputField } from "../ui/InputField";

const MODEL_PRESETS = [
  "gemini-2.5-flash",
  "gemini-3-flash",
  "gemini-3-flash-lite",
];

export default function SettingsPage() {
  const { user, profile, refreshProfile, signOut } = useAuth();
  const [apiKey, setApiKey] = useState("");
  const [aiSettings, setAiSettings] = useState(DEFAULT_AI_SETTINGS);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    setApiKey(profile?.geminiApiKey || "");
    setAiSettings(normalizeAiSettings(profile?.settings?.ai || {}));
  }, [profile?.geminiApiKey, profile?.settings?.ai]);

  const modelCheckList = useMemo(() => {
    const values = [aiSettings.questionModel, aiSettings.analysisModel, aiSettings.analysisFallbackModel]
      .map((x) => x.trim())
      .filter(Boolean);
    return [...new Set(values)];
  }, [aiSettings]);

  const onSave = async () => {
    setSaving(true);
    setMessage("");

    const normalized = normalizeAiSettings(aiSettings);
    try {
      await saveUserKey(user.uid, apiKey.trim(), normalized);
      localStorage.setItem("toeic.ai.settings", JSON.stringify(normalized));
      await refreshProfile(user.uid);
      setMessage("已儲存，模型與 API Key 會在其他裝置自動同步。");
    } catch (err) {
      setMessage(err.message || "儲存失敗");
    } finally {
      setSaving(false);
    }
  };

  const onCheckModels = async () => {
    if (!apiKey.trim()) {
      setMessage("請先輸入 Gemini API Key 再檢查模型。");
      return;
    }

    setChecking(true);
    setMessage("正在檢查模型可用性...");

    const result = [];
    for (const model of modelCheckList) {
      try {
        await probeModelAvailability({ apiKey: apiKey.trim(), model });
        result.push(`[OK] ${model}: 可用`);
      } catch (err) {
        result.push(`[FAIL] ${model}: ${err.message || "不可用"}`);
      }
    }

    setMessage(result.join("\n"));
    setChecking(false);
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

  const onAiField = (key, value) => {
    setAiSettings((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="stack-lg">
      <section className="hero-panel compact">
        <p className="eyebrow">SETTINGS</p>
        <h2>帳號與模型設定</h2>
        <p className="muted">Gemini Key 與模型偏好都會同步到你的 Firestore user 文件。</p>
        <div className="mascot-tip compact">
          <span className="mascot-avatar" aria-hidden="true">🛠️</span>
          <p>先檢查模型可用性，再開始刷題，流程會更順。</p>
        </div>
      </section>

      <Card>
        <h3>Gemini API Key（跨裝置同步）</h3>
        <InputField
          label="GEMINI_API_KEY"
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="AIza..."
        />

        <div className="row wrap">
          <Button onClick={onSave} disabled={saving}>儲存 Key 與模型</Button>
          <Button variant="secondary" onClick={onCheckModels} disabled={checking || saving}>檢查模型可用性</Button>
          <Button variant="ghost" onClick={onImport} disabled={saving}>匯入舊版 localStorage</Button>
        </div>

        <p className="muted">僅儲存在 `users/{'{uid}'}`，不會公開給其他人。</p>
      </Card>

      <Card>
        <h3>AI 模型路由</h3>
        <p className="muted">預設策略：2.5 出題、3 解析，失敗時自動降級到 2.5。</p>

        <InputField
          label="出題模型"
          value={aiSettings.questionModel}
          onChange={(e) => onAiField("questionModel", e.target.value)}
          list="gemini-model-list"
        />
        <InputField
          label="解析主模型"
          value={aiSettings.analysisModel}
          onChange={(e) => onAiField("analysisModel", e.target.value)}
          list="gemini-model-list"
        />
        <InputField
          label="解析備援模型"
          value={aiSettings.analysisFallbackModel}
          onChange={(e) => onAiField("analysisFallbackModel", e.target.value)}
          list="gemini-model-list"
        />

        <datalist id="gemini-model-list">
          {MODEL_PRESETS.map((m) => <option key={m} value={m} />)}
        </datalist>
      </Card>

      {message && (
        <Banner tone={message.includes("[FAIL]") || message.includes("失敗") ? "danger" : "info"}>
          <span className="preline">{message}</span>
        </Banner>
      )}

      <Card>
        <h3>帳號</h3>
        <p className="muted">{user?.email}</p>
        <Button variant="danger" onClick={signOut}>登出</Button>
      </Card>
    </div>
  );
}
