// The before-and-after self-assessment and the end-of-course evaluation. Shared by the app and the Worker.
// Changing the order or meaning of a statement breaks comparisons with answers already collected: add new
// statements at the end instead, and bump ASSESSMENT_VERSION.
export const ASSESSMENT_VERSION = 1;
export const SCALE = ['Rarely', 'Sometimes', 'Often', 'Usually', 'Consistently'];
export const STATEMENTS = [
  { id: 'feedback', text: 'I give specific feedback within a week of seeing the behaviour.', session: 'feedback' },
  { id: 'why', text: 'When I ask for something, I explain why, not just what.', session: 'communication' },
  { id: 'listen', text: 'I listen to the end before I answer or decide.', session: 'communication' },
  { id: 'safety', text: 'People on my team tell me about problems early, including my own mistakes.', session: 'trust' },
  { id: 'balance', text: 'I pay attention to the task, the team and each individual, not just the task.', session: 'functional' },
  { id: 'delegate', text: 'When I delegate, I agree the outcome, the limits and when we will check in.', session: 'delegation' },
  { id: 'develop', text: 'I spend time helping each person grow, not only fixing today’s work.', session: 'motivation' },
  { id: 'decide', text: 'I explain how a decision will be made before we make it.', session: 'decisions' },
  { id: 'conflict', text: 'I deal with disagreement directly and early instead of letting it build.', session: 'decisions' },
  { id: 'follow', text: 'When I disagree with my own leader, I say so in private, with evidence, then support the decision.', session: 'followership' },
];
// Facilitators see averages only when at least this many people answered, so no one person's answers show through.
export const MIN_GROUP = 3;

export const EVALUATION = {
  relevance: { q: 'How relevant was this course to your work?', scale: ['Not relevant', 'A little', 'Somewhat', 'Very', 'Extremely'] },
  pace: { q: 'How was the pace?', scale: ['Much too slow', 'A bit slow', 'About right', 'A bit fast', 'Much too fast'] },
  facilitator: { q: 'How effective was the facilitator?', scale: ['Not effective', 'A little', 'Somewhat', 'Very', 'Extremely'] },
  improve: { q: 'One thing we should improve' },
};
