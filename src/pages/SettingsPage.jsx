import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { DEFAULT_AI_SETTINGS, normalizeAiSettings } from "../lib/aiModels";
import { probeModelAvailability } from "../lib/geminiService";
import { importLegacyLocalData, saveUserKey, saveUserSettings } from "../lib/firestoreService";
import { normalizeTargetSettings, targetLevelFromScore } from "../lib/targetDifficulty";
import { Banner } from "../ui/Banner";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { InputField } from "../ui/InputField";

const MODEL_PRESETS = [
  "gemini-2.5-flash",
  "gemini-3-flash",
  "gemini-3-flash-lite",
];

const TARGET_SCORE_OPTIONS = [
  { score: 470, label: "綠證 470+" },
  { score: 730, label: "藍證 730+" },
  { score: 860, label: "金證 860+" },
];

export default function SettingsPage() {
  const { user, profile, refreshProfile, signOut } = useAuth();
  const [apiKey, setApiKey] = useState("");
  const [aiSettings, setAiSettings] = useState(DEFAULT_AI_SETTINGS);
  const [examPreset, setExamPreset] = useState("10x5");
  const [targetScore, setTargetScore] = useState(860);
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderTime, setReminderTime] = useState("20:30");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    setApiKey(profile?.geminiApiKey || "");
    setAiSettings(normalizeAiSettings(profile?.settings?.ai || {}));
    setExamPreset(profile?.settings?.examPreset || "10x5");
    setTargetScore(normalizeTargetSettings(profile?.settings || {}).targetScore);
    setReminderEnabled(!!profile?.settings?.reminder?.enabled);
    setReminderTime(profile?.settings?.reminder?.time || "20:30");
  }, [profile?.geminiApiKey, profile?.settings]);

  const modelCheckList = useMemo(() => {
    const values = [aiSettings.questionModel, aiSettings.analysisModel, aiSettings.analysisFallbackModel]
      .map((x) => x.trim())
      .filter(Boolean);
    return [...new Set(values)];
  }, [aiSettings]);

  const modelSuggestions = useMemo(() => {
    return [...new Set([
      ...MODEL_PRESETS,
      aiSettings.questionModel,
      aiSettings.analysisModel,
      aiSettings.analysisFallbackModel,
      profile?.settings?.ai?.questionModel,
      profile?.settings?.ai?.analysisModel,
      profile?.settings?.ai?.analysisFallbackModel,
    ].filter(Boolean).map((x) => String(x).trim()))];
  }, [aiSettings, profile?.settings?.ai]);

  const onSaveAll = async () => {
    setSaving(true);
    setMessage("");

    const normalizedAi = normalizeAiSettings(aiSettings);
    try {
      await saveUserKey(user.uid, apiKey.trim(), normalizedAi, {
        examPreset,
        targetScore,
        targetLevel: targetLevelFromScore(targetScore),
        reminder: {
          enabled: reminderEnabled,
          time: reminderTime,
        },
      });
      localStorage.setItem("toeic.ai.settings", JSON.stringify(normalizedAi));
      await refreshProfile(user.uid);
      setMessage("已儲存：API Key、模型、目標分數、考試預設與每日提醒設定已同步。");
    } catch (err) {
      setMessage(err.message || "儲存失敗");
    } finally {
      setSaving(false);
    }
  };

  const onSaveModelsOnly = async () => {
    setSaving(true);
    setMessage("");
    try {
      const normalizedAi = normalizeAiSettings(aiSettings);
      await saveUserSettings(user.uid, { ai: normalizedAi });
      localStorage.setItem("toeic.ai.settings", JSON.stringify(normalizedAi));
      await refreshProfile(user.uid);
      setMessage("模型設定已儲存（可自訂任意模型 ID）。");
    } catch (err) {
      setMessage(err.message || "儲存模型失敗");
    } finally {
      setSaving(false);
    }
  };

  const onResetModelsToDefault = () => {
    setAiSettings(DEFAULT_AI_SETTINGS);
    setMessage("已套用預設模型，記得按「僅儲存模型設定」或「儲存全部設定」。");
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

  const requestNotifyPermission = async () => {
    if (!("Notification" in window)) {
      setMessage("此瀏覽器不支援 Web Notifications。");
      return;
    }

    const permission = await Notification.requestPermission();
    setMessage(`通知權限狀態：${permission}`);
  };

  const sendTestNotification = () => {
    if (!("Notification" in window) || Notification.permission !== "granted") {
      setMessage("請先開啟通知權限。");
      return;
    }

    new Notification("TOEIC 90 Days", {
      body: "這是測試提醒：記得回來打卡刷題。",
      icon: `${import.meta.env.BASE_URL}icons/icon-192.svg`,
    });
  };

  const onSaveReminderOnly = async () => {
    setSaving(true);
    try {
      await saveUserSettings(user.uid, {
        reminder: { enabled: reminderEnabled, time: reminderTime },
        examPreset,
        targetScore,
        targetLevel: targetLevelFromScore(targetScore),
      });
      await refreshProfile(user.uid);
      setMessage("提醒、預設與目標分數已儲存。");
    } catch (err) {
      setMessage(err.message || "儲存失敗");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="stack-lg">
      <section className="hero-panel compact">
        <p className="eyebrow">SETTINGS</p>
        <h2>帳號與學習設定</h2>
        <p className="muted">Gemini Key、模型、目標分數、考試預設、提醒時間都會同步到 Firestore。</p>
      </section>

      <Card>
        <h3>Gemini API Key</h3>
        <InputField
          label="GEMINI_API_KEY"
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="AIza..."
        />

        <div className="row wrap">
          <Button onClick={onSaveAll} disabled={saving}>儲存全部設定</Button>
          <Button variant="secondary" onClick={onCheckModels} disabled={checking || saving}>檢查模型可用性</Button>
          <Button variant="ghost" onClick={onImport} disabled={saving}>匯入舊版 localStorage</Button>
        </div>
      </Card>

      <Card>
        <h3>AI 模型路由（可自訂）</h3>
        <p className="muted">可自行輸入任何模型 ID，不會被預設鎖住。儲存後跨裝置同步。</p>

        <InputField
          label="出題模型"
          value={aiSettings.questionModel}
          onChange={(e) => onAiField("questionModel", e.target.value)}
          list="gemini-model-list"
          placeholder="例如：gemini-2.5-flash"
        />
        <InputField
          label="解析主模型"
          value={aiSettings.analysisModel}
          onChange={(e) => onAiField("analysisModel", e.target.value)}
          list="gemini-model-list"
          placeholder="例如：gemini-3-flash"
        />
        <InputField
          label="解析備援模型"
          value={aiSettings.analysisFallbackModel}
          onChange={(e) => onAiField("analysisFallbackModel", e.target.value)}
          list="gemini-model-list"
          placeholder="例如：gemini-2.5-flash"
        />

        <datalist id="gemini-model-list">
          {modelSuggestions.map((m) => <option key={m} value={m} />)}
        </datalist>

        <div className="row wrap">
          <Button variant="secondary" onClick={onSaveModelsOnly} disabled={saving}>僅儲存模型設定</Button>
          <Button variant="ghost" onClick={onResetModelsToDefault} disabled={saving}>套用預設模型</Button>
        </div>
      </Card>

      <Card>
        <h3>考試與提醒</h3>
        <label className="field-wrap">
          <span className="field-label">目標分數</span>
          <select
            className="field-input"
            value={targetScore}
            onChange={(e) => setTargetScore(Number(e.target.value))}
          >
            {TARGET_SCORE_OPTIONS.map((item) => (
              <option key={item.score} value={item.score}>{item.label}</option>
            ))}
          </select>
        </label>

        <label className="field-wrap">
          <span className="field-label">預設考試題數</span>
          <select className="field-input" value={examPreset} onChange={(e) => setExamPreset(e.target.value)}>
            <option value="10x5">10 題 / 5 分鐘</option>
            <option value="20x10">20 題 / 10 分鐘</option>
          </select>
        </label>

        <label className="checkbox-row">
          <input type="checkbox" checked={reminderEnabled} onChange={(e) => setReminderEnabled(e.target.checked)} />
          <span>開啟每日提醒</span>
        </label>

        <InputField
          label="提醒時間"
          type="time"
          value={reminderTime}
          onChange={(e) => setReminderTime(e.target.value)}
        />

        <div className="row wrap">
          <Button variant="secondary" onClick={requestNotifyPermission}>開啟通知權限</Button>
          <Button variant="ghost" onClick={sendTestNotification}>發送測試通知</Button>
          <Button onClick={onSaveReminderOnly} disabled={saving}>只儲存提醒/預設/目標</Button>
        </div>
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
