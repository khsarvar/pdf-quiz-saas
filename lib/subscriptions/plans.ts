export type Plan = {
  name: string;
  price: number;
  quizGenerations: number;
  canRegenerateQuizzes: boolean;
  questionsPerQuiz: number;
};

export const PLANS = {
  free: {
    name: 'Free',
    price: 0,
    quizGenerations: 2, // lifetime, no period
    canRegenerateQuizzes: false,
    questionsPerQuiz: 10,
  },
  plus: {
    name: 'Plus',
    price: 800, // $8.00 in cents
    quizGenerations: 30, // per period
    canRegenerateQuizzes: true,
    questionsPerQuiz: 20, // 10 base + 10 additional
  },
  pro: {
    name: 'Pro',
    price: 2000, // $20.00 in cents
    quizGenerations: 200, // per period
    canRegenerateQuizzes: true,
    questionsPerQuiz: 20, // 10 base + 10 additional
  },
} as const satisfies Record<string, Plan>;

export type PlanName = keyof typeof PLANS;
