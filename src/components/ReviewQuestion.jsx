import React from "react";

function letter(i) {
  return String.fromCharCode(65 + i);
}

export default function ReviewQuestion({ question, index, extraHeader = null }) {
  const q = question;
  const userAnswer = q.userAnswer;
  const answered = userAnswer != null;
  const isCorrect = answered && userAnswer === q.answer;
  const optionsZh = Array.isArray(q.optionsZh)
    ? q.optionsZh
    : (Array.isArray(q.options_zh) ? q.options_zh : []);
  const optionReview = Array.isArray(q.optionReviewZh) ? q.optionReviewZh : [];
  const correctReason = q.correctReasonZh || q.explanation || "";

  return (
    <div className="review-question">
      <div className="review-head">
        <div className="review-head-left">
          <span className="review-qno">Q{index + 1}</span>
          <span className={`pill ${isCorrect ? "ok" : "ng"}`}>{isCorrect ? "答對" : "答錯"}</span>
        </div>
        <div className="review-answers">
          <span className="answer-chip">
            <span className="answer-chip-label">你的選擇</span>
            <span className={`answer-chip-value ${isCorrect ? "is-correct" : "is-wrong"}`}>
              {answered ? letter(userAnswer) : "—"}
            </span>
          </span>
          <span className="answer-chip">
            <span className="answer-chip-label">正解</span>
            <span className="answer-chip-value is-correct">{letter(q.answer)}</span>
          </span>
        </div>
      </div>

      {extraHeader}

      {q.passage ? (
        <div className="review-passage">
          <p className="review-en">{q.passage}</p>
          {q.passageZh ? <p className="review-zh"><span className="zh-tag">中</span>{q.passageZh}</p> : null}
        </div>
      ) : null}

      {q.question ? (
        <div className="review-question-text">
          <p className="review-en">{q.question}</p>
          {q.questionZh ? <p className="review-zh"><span className="zh-tag">中</span>{q.questionZh}</p> : null}
        </div>
      ) : null}

      <ul className="list review-options">
        {q.options.map((opt, i) => {
          const isAnswer = q.answer === i;
          const isUserWrong = answered && userAnswer === i && !isAnswer;
          const accent = isAnswer ? "correct" : (isUserWrong ? "wrong" : "");
          const review = optionReview[i] || "";
          const defaultOpen = isAnswer || isUserWrong;
          return (
            <li key={i} className={`option-review ${accent}`}>
              <div className="option-row">
                <span className="option-letter">{letter(i)}</span>
                <div className="option-body">
                  <p className="option-en">{opt}</p>
                  {optionsZh[i] ? <p className="option-zh">{optionsZh[i]}</p> : null}
                </div>
                <div className="option-tags">
                  {isAnswer ? <span className="tag tag-correct">正解</span> : null}
                  {isUserWrong ? <span className="tag tag-wrong">你的答案</span> : null}
                </div>
              </div>
              {review ? (
                <details className="option-detail" open={defaultOpen}>
                  <summary>選項解析</summary>
                  <p>{review}</p>
                </details>
              ) : null}
            </li>
          );
        })}
      </ul>

      {(correctReason || q.trapExplanationZh) ? (
        <div className="analysis-panel">
          <div className="analysis-title">正解分析</div>
          {correctReason ? (
            <div className="analysis-block analysis-reason">
              <div className="analysis-block-title">正解理由</div>
              <p>{correctReason}</p>
            </div>
          ) : null}
          {q.trapExplanationZh ? (
            <div className="analysis-block analysis-trap">
              <div className="analysis-block-title">陷阱解析</div>
              <p>{q.trapExplanationZh}</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
