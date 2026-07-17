import type { Trend } from '../domain/types';

export interface QuestionContext {
  lonelyStreak: number;
  trend: Trend;
}

export interface ScreeningQuestionComposer {
  compose(q: 1 | 2 | 3, ctx: QuestionContext): Promise<string>;
}

export const UCLA3_CANONICAL: Record<1 | 2 | 3, string> = {
  1: 'Time for a quick screen break! Just out of curiosity, how often do you feel that you lack companionship outside of work lately?',
  2: 'And how often do you feel left out or excluded by the people around you?',
  3: "Last one — how often do you feel distant from the people around you these days?",
};

export class TemplateScreeningQuestionComposer implements ScreeningQuestionComposer {
  async compose(q: 1 | 2 | 3): Promise<string> {
    return UCLA3_CANONICAL[q];
  }
}
