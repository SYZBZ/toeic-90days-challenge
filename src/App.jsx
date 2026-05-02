import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import AppShell from "./components/AppShell";
import ProtectedRoute from "./components/ProtectedRoute";

const LoginPage = lazy(() => import("./pages/LoginPage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const PracticePage = lazy(() => import("./pages/PracticePage"));
const ReviewPage = lazy(() => import("./pages/ReviewPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const VocabularyPage = lazy(() => import("./pages/VocabularyPage"));
const GrammarPage = lazy(() => import("./pages/GrammarPage"));
const ProgressPage = lazy(() => import("./pages/ProgressPage"));
const MistakesPage = lazy(() => import("./pages/MistakesPage"));
const VocabGamePage = lazy(() => import("./pages/VocabGamePage"));
const DailyVocabPage = lazy(() => import("./pages/DailyVocabPage"));

export default function App() {
  return (
    <Suspense fallback={<div className="center-screen">載入中...</div>}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/vocabulary" element={<VocabularyPage />} />
            <Route path="/daily-vocab" element={<DailyVocabPage />} />
            <Route path="/practice" element={<PracticePage />} />
            <Route path="/grammar" element={<GrammarPage />} />
            <Route path="/review" element={<ReviewPage />} />
            <Route path="/mistakes" element={<MistakesPage />} />
            <Route path="/progress" element={<ProgressPage />} />
            <Route path="/vocab-game" element={<VocabGamePage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
