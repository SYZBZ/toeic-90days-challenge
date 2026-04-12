import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Banner } from "../ui/Banner";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { InputField } from "../ui/InputField";

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn, signUp, resetPassword, configError, firebaseReady } = useAuth();

  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const from = location.state?.from?.pathname || "/dashboard";

  const onSubmit = async (e) => {
    e.preventDefault();
    setMessage("");
    setLoading(true);

    try {
      if (mode === "signup") {
        await signUp(email, password);
      } else {
        await signIn(email, password);
      }
      navigate(from, { replace: true });
    } catch (err) {
      setMessage(err.message || "登入失敗");
    } finally {
      setLoading(false);
    }
  };

  const onForgot = async () => {
    if (!email) {
      setMessage("請先輸入 Email 再重設密碼");
      return;
    }

    try {
      await resetPassword(email);
      setMessage("已寄送重設密碼信，請到信箱確認");
    } catch (err) {
      setMessage(err.message || "寄送失敗");
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-glow" aria-hidden="true" />
      <Card className="auth-card" elevated>
        <div className="stack-sm">
          <p className="eyebrow">90 DAYS CHALLENGE</p>
          <h2 className="auth-title">登入多益寵物學園</h2>
          <p className="muted">跨裝置同步你的 API Key、錯題與學習進度</p>
          <div className="mascot-tip compact">
            <span className="mascot-avatar" aria-hidden="true">🐶</span>
            <p>今天也來完成一小步，讓你的寵物和分數一起升級。</p>
          </div>
        </div>

        {!firebaseReady && (
          <Banner tone="danger">
            {configError}
            <br />
            請先在 `.env` 填入 Firebase Web 設定，然後重啟 `npm run dev`。
          </Banner>
        )}

        <form className="stack" onSubmit={onSubmit}>
          <InputField
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="you@example.com"
          />
          <InputField
            label="密碼"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            placeholder="至少 6 碼"
          />

          <Button type="submit" fullWidth disabled={loading || !firebaseReady}>
            {loading ? "處理中..." : mode === "signup" ? "建立新帳號" : "登入"}
          </Button>

          <div className="row between">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
            >
              {mode === "signup" ? "改為登入" : "建立新帳號"}
            </Button>
            <Button type="button" variant="ghost" onClick={onForgot}>忘記密碼</Button>
          </div>
        </form>

        {message && <Banner>{message}</Banner>}
      </Card>
    </div>
  );
}
