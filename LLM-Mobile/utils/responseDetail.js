import { FEATURES } from '../constants/featureFlags';

export const DETAIL_OPTIONS = [
  { value: 'brief', label: 'Brief', description: 'Short key points. Keeps the steps, warnings and measurements.' },
  { value: 'standard', label: 'Standard', description: 'A complete answer with moderate explanation.' },
  { value: 'detailed', label: 'Detailed', description: 'Searches more of the manual and explains the reasons, where the manual gives them.' },
];

export const isResponseDetail = value => DETAIL_OPTIONS.some(option => option.value === value);
// What the picker offers. Brief stays a known value, so answers saved while it
// was offered still display, but it cannot be chosen or sent while it is hidden.
export const offeredDetails = () => DETAIL_OPTIONS.filter(option => option.value !== 'brief' || FEATURES.BRIEF_ANSWERS);
export const normaliseDetail = value => offeredDetails().some(option => option.value === value) ? value : 'standard';

// The detail the server says it wrote the answer in, never the one that was
// only asked for: a Brief request can come back as a Standard answer.
const appliedDetail = (message, enabled) => enabled && isResponseDetail(message.responseDetail) ? message.responseDetail : null;

// Standard is the norm, so only Brief and Detailed answers are labelled.
export function answerDetailLabel(message, enabled = true) {
  const applied = appliedDetail(message, enabled);
  return applied && applied !== 'standard' ? `${DETAIL_OPTIONS.find(option => option.value === applied).label} answer` : null;
}

// Standard, hands-free and flag-off requests keep the old wire contract (no detail property).
export function detailRequestFields({ detail, voice = false, enabled = true }) {
  const value = normaliseDetail(detail);
  return enabled && !voice && value !== 'standard' ? { detail: value } : {};
}

// Brief and Detailed open on the written answer, since that is what was asked
// for; Standard keeps opening on the guided procedure when there is one.
export function answerView(message, enabled = true) {
  const hasSteps = message.isProcedural && message.steps?.length > 0;
  const saved = message.procedureView;
  if (saved === 'text' || (saved === 'procedure' && hasSteps) || (saved === 'full' && hasFull(message, enabled))) return saved;
  const applied = appliedDetail(message, enabled);
  if (applied === 'brief' || applied === 'detailed') return 'text';
  return hasSteps ? 'procedure' : 'text';
}

export const textViewLabel = (message, enabled = true) => appliedDetail(message, enabled) === 'brief' ? 'Brief' : 'Full';

// A Brief answer carries the Standard answer it was checked against, offered as "Full".
const hasFull = (message, enabled) => appliedDetail(message, enabled) === 'brief' &&
  typeof message.fullText === 'string' && !!message.fullText.trim();

// The views an answer can switch between, in display order.
export function answerViews(message, enabled = true) {
  const hasSteps = message.isProcedural && message.steps?.length > 0;
  return [
    ...(hasSteps ? [{ value: 'procedure', label: 'Procedure' }] : []),
    { value: 'text', label: textViewLabel(message, enabled) },
    ...(hasFull(message, enabled) ? [{ value: 'full', label: 'Full' }] : []),
  ];
}

// Selection follows what is on screen: the answer, or the current guided step.
export function displayedAnswerText(message, enabled = true) {
  const view = answerView(message, enabled);
  if (view === 'full') return message.fullText;
  if (view === 'text') return message.text || '';
  const steps = message.steps;
  const current = Math.min(Math.max(message.procedureState?.currentStep || 0, 0), steps.length - 1);
  const step = steps[current];
  const parts = [
    `Step ${current + 1} of ${steps.length}`,
    step.warningLevel === 'critical' ? 'CRITICAL' : step.warningLevel === 'caution' ? 'CAUTION' : '',
    step.title, step.description,
    step.toolsRequired?.length ? `Tools required: ${step.toolsRequired.join(', ')}` : '',
  ];
  if (message.procedureState?.overviewOpen) parts.push('All steps', ...steps.map(s => s.title));
  return parts.filter(Boolean).join('\n');
}

export function detailFallbackMessage(reason) {
  if (reason === 'unverified_figures') {
    return 'A figure in the Brief answer could not be matched to the manual, so the Standard answer is shown.';
  }
  if (reason === 'missing_safety_detail') {
    return 'The Brief answer left out a safety detail or measurement, so the Standard answer is shown.';
  }
  return 'A Brief answer was not available, so the Standard answer is shown.';
}
