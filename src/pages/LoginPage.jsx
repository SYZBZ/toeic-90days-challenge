import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn, signUp, resetPassword } = useAuth();

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
      setMessage("請先輸入 Email，再點忘記密碼。");
      return;
    }
    try {
      await resetPassword(email);
      setMessage("已寄送密碼重設信。請到信箱收信。");
    } catch (err) {
      setMessage(err.message || "寄送失敗");
    }
  };

  return (
    <div className="center-screen login-wrap">
      <form className="card form" onSubmit={onSubmit}>
        <h2>登入 TOEIC 90 Days</h2>
        <p className="muted">跨裝置同步你的 API Key、錯題與學習進度</p>

        <label>Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />

        <label>密碼</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />

        <button className="btn primary" type="submit" disabled={loading}>
          {loading ? "處理中..." : mode === "signup" ? "註冊" : "登入"}
        </button>

        <div className="row between">
          <button className="btn ghost" type="button" onClick={() => setMode(mode === "signup" ? "signin" : "signup")}>
            {mode === "signup" ? "我已有帳號" : "建立新帳號"}
          </button>
          <button className="btn ghost" type="button" onClick={onForgot}>忘記密碼</button>
        </div>

        {message && <p className="alert">{message}</p>}
      </form>
    </div>
  );
}
