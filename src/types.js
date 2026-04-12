/**
 * @typedef {Object} AiSettings
 * @property {string} questionModel
 * @property {string} analysisModel
 * @property {string} analysisFallbackModel
 */

/**
 * @typedef {Object} UserProfile
 * @property {string} email
 * @property {string} geminiApiKey
 * @property {{level?: string, part?: string, ai?: AiSettings}} settings
 */

/**
 * @typedef {Object} GeminiRoutingRequest
 * @property {string} part
 * @property {string} topic
 * @property {string} level
 */

/**
 * @typedef {Object} QuestionItem
 * @property {string} question
 * @property {string[]} options
 * @property {{part: string, topic: string, level: string, questionModel?: string}} meta
 */

/**
 * @typedef {Object} AnalysisResult
 * @property {number} correctAnswerIndex
 * @property {string} translationZh
 * @property {string} trapExplanationZh
 * @property {string} correctReasonZh
 * @property {string[]} optionReviewZh
 * @property {string=} modelUsed
 */

/**
 * @typedef {Object} HistoryRecord
 * @property {string} question
 * @property {string[]} options
 * @property {number} userAnswer
 * @property {number} correctAnswer
 * @property {boolean} correct
 */

/**
 * @typedef {Object} MistakeRecord
 * @property {string} id
 * @property {string} question
 * @property {number|string} yourAnswer
 * @property {number|string} correctAnswer
 */

/**
 * @typedef {Object} SummaryStats
 * @property {number} totalAnswered
 * @property {number} totalCorrect
 * @property {number} streakDays
 * @property {string} lastStudyDate
 * @property {number} dayProgress
 */

export {};
