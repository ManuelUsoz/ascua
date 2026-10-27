export interface QuestionOption {
  label: string;
  description?: string;
}

export interface Question {
  question: string;
  header?: string;
  multiSelect: boolean;
  options: QuestionOption[];
}

export interface QuestionRequest {
  requestId: string;
  toolUseId?: string;
  questions: Question[];
}

/** Question text to the chosen label(s), joined with ", ", or free text. */
export type QuestionAnswers = Record<string, string>;

export type QuestionDecision =
  | { answered: true; answers: QuestionAnswers }
  | { answered: false; reason?: 'skipped' | 'aborted' };
