/**
 * @typedef {Object} ReminderSettings
 * @property {boolean} enabled
 * @property {string} time
 */

/**
 * @typedef {Object} VocabPlanSettings
 * @property {string} startDate
 * @property {string} examDate
 */

/**
 * @typedef {Object} ExamSettings
 * @property {number} freshRate
 */

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
 * @property {{level?: string, targetScore?: 470|730|860, targetLevel?: "green"|"blue"|"gold", part?: string, examPreset?: "10x5"|"20x10", exam?: ExamSettings, vocabPlan?: VocabPlanSettings, reminder?: ReminderSettings, ai?: AiSettings}} settings
 */

/**
 * @typedef {Object} PassageGroup
 * @property {string} passage
 * @property {string} passage_zh
 * @property {QuestionItem[]} questions
 */

/**
 * @typedef {Object} PoolDoc
 * @property {string} poolDocId
 * @property {"part5"|"part6"|"part7"} part
 * @property {"single"|"passage_group"} kind
 * @property {"green"|"blue"|"gold"} level
 * @property {string} hashId
 * @property {number} size
 * @property {QuestionItem|PassageGroup} payload
 */

/**
 * @typedef {Object} PoolStock
 * @property {number} part5
 * @property {number} part6
 * @property {number} part7
 * @property {number} mixed
 */

/**
 * @typedef {Object} DispatchPlan
 * @property {number} mustNew
 * @property {number} allowedStock
 * @property {number} actualStock
 * @property {number} apiFetch
 */

/**
 * @typedef {Object} QuestionItem
 * @property {string} id
 * @property {string} type
 * @property {string=} passage
 * @property {string} question
 * @property {string[]} options
 * @property {number} answer
 * @property {"green"|"blue"|"gold"} difficulty
 * @property {string=} explanation
 */

/**
 * @typedef {Object} AnalysisResult
 * @property {string} questionZh
 * @property {string[]} optionsZh
 * @property {string} trapExplanationZh
 * @property {string} correctReasonZh
 * @property {string[]} optionReviewZh
 * @property {string=} modelUsed
 */

/**
 * @typedef {Object} SummaryStats
 * @property {number} totalAnswered
 * @property {number} totalCorrect
 * @property {number} streakDays
 * @property {string} lastStudyDate
 * @property {number} dayProgress
 * @property {number} masteredWords
 * @property {number} dayX
 */

export {};
