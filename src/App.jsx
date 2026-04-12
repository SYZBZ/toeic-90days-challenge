import { Navigate, Route, Routes } from "react-router-dom";
import AppShell from "./components/AppShell";
import ProtectedRoute from "./components/ProtectedRoute";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import PracticePage from "./pages/PracticePage";
import ReviewPage from "./pages/ReviewPage";
import SettingsPage from "./pages/SettingsPage";
import VocabularyPage from "./pages/VocabularyPage";
import GrammarPage from "./pages/GrammarPage";
import ProgressPage from "./pages/ProgressPage";
import MistakesPage from "./pages/MistakesPage";
import VocabGamePage from "./pages/VocabGamePage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/vocabulary" element={<VocabularyPage />} />
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
  );
}
