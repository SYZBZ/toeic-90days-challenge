import { useState } from "react";
import PracticeReadingPanel from "./PracticeReadingPanel";
import PracticeListeningPanel from "./PracticeListeningPanel";
import { audioManager } from "../lib/audioManager";

export default function PracticePage() {
  const [tab, setTab] = useState("reading");

  function switchTab(next) {
    audioManager.stopAll();
    setTab(next);
  }

  return (
    <div className="stack-lg">
      <div className="row wrap">
        <button
          type="button"
          className={`choice-chip ${tab === "reading" ? "active" : ""}`}
          onClick={() => switchTab("reading")}
        >
          閱讀測驗 (Part 5~7)
        </button>
        <button
          type="button"
          className={`choice-chip ${tab === "listening" ? "active" : ""}`}
          onClick={() => switchTab("listening")}
        >
          聽力測驗 (Part 1~4)
        </button>
      </div>

      {tab === "reading" ? <PracticeReadingPanel /> : <PracticeListeningPanel />}
    </div>
  );
}
