export const PLANS = {
  free: {
    name: 'Free',
    price: 0,
    documentUploads: 2, // lifetime, no period
    quizGenerations: 2, // lifetime, no period
    canRegenerateQuizzes: false,
    questionsPerQuiz: 10,
  },
  plus: {
    name: 'Plus',
    price: 800, // $8.00 in cents
    documentUploads: 30, // per period
    quizGenerations: 30, // per period
    canRegenerateQuizzes: true,
    questionsPerQuiz: 20, // 10 base + 10 additional
  },
  pro: {
    name: 'Pro',
    price: 2000, // $20.00 in cents
    documentUploads: 200, // per period
    quizGenerations: 200, // per period
    canRegenerateQuizzes: true,
    questionsPerQuiz: 20, // 10 base + 10 additional
  },
} as const;

export type PlanName = keyof typeof PLANS;
export type Plan = typeof PLANS[PlanName];

