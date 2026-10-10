import { answerView, displayedAnswerText, detailRequestFields, normaliseDetail, detailFallbackMessage, answerDetailLabel, textViewLabel } from '../utils/responseDetail';
import { answerForClipboard } from '../utils/messageText';
import { FEATURES } from '../constants/featureFlags';

beforeEach(() => { FEATURES.BRIEF_ANSWERS = true; });
afterAll(() => { FEATURES.BRIEF_ANSWERS = false; });

const message = {
  text: 'Short answer.', responseDetail: 'brief', isProcedural: true,
  steps: [{ title: 'First step', description: 'First description.', toolsRequired: ['Meter'] }, { title: 'Second step', description: 'Second description.' }],
};

test('APP-A1-1 a Brief answer opens on the answer, even when it has guided steps', () => {
  expect(answerView(message)).toBe('text');
  expect(textViewLabel(message)).toBe('Brief');
});

test('APP-A1-2 Standard keeps opening on the guided procedure', () => {
  expect(answerView({ ...message, responseDetail: 'standard' })).toBe('procedure');
  expect(textViewLabel({ ...message, responseDetail: 'standard' })).toBe('Full');
});

test('APP-A1-3 Detailed opens on the answer but respects a view the user chose', () => {
  expect(answerView({ ...message, responseDetail: 'detailed' })).toBe('text');
  expect(answerView({ ...message, responseDetail: 'detailed', procedureView: 'procedure' })).toBe('procedure');
});

test('APP-A1-4 the label shows what the server wrote, not what was asked for', () => {
  expect(answerDetailLabel({ responseDetail: 'brief' })).toBe('Brief answer');
  expect(answerDetailLabel({ responseDetail: 'detailed' })).toBe('Detailed answer');
  expect(answerDetailLabel({ detail: 'brief', responseDetail: 'standard' })).toBeNull();
  expect(answerDetailLabel({ detail: 'brief' })).toBeNull();
  expect(answerDetailLabel({ text: 'Old answer' })).toBeNull();
  expect(answerDetailLabel({ responseDetail: 'brief' }, false)).toBeNull();
});

test('APP-A1-5 a Brief request answered in Standard behaves like Standard', () => {
  const fallback = { ...message, detail: 'brief', responseDetail: 'standard', detailFallback: 'unverified_figures' };
  expect(answerView(fallback)).toBe('procedure');
  expect(textViewLabel(fallback)).toBe('Full');
});

test('APP-A1-6 answers saved by older builds still open', () => {
  expect(answerView({ text: 'hello' })).toBe('text');
  expect(answerView({ ...message, responseDetail: undefined, procedureView: 'brief' })).toBe('procedure');
  expect(answerView(message, false)).toBe('procedure');
});

test('APP-A1-7 copy and selection both use the answer on screen', () => {
  expect(displayedAnswerText(message)).toBe('Short answer.');
  expect(answerForClipboard(message)).toBe('Short answer.');
});

test('APP-A1-8 selecting in the procedure view uses the current step', () => {
  const selected = { ...message, procedureView: 'procedure', procedureState: { currentStep: 1 } };
  expect(displayedAnswerText(selected)).toContain('Second description.');
  expect(displayedAnswerText(selected)).not.toContain('First description.');
  expect(displayedAnswerText({ ...selected, procedureState: { currentStep: 1, overviewOpen: true } })).toContain('First step');
});

test.each(['standard', undefined, 'invalid'])('APP-A2-1 %p is not sent to the server', detail => expect(detailRequestFields({ detail })).toEqual({}));

test.each(['brief', 'detailed'])('APP-A2-2 %s is sent only for typed questions with the feature on', detail => {
  expect(detailRequestFields({ detail })).toEqual({ detail });
  expect(detailRequestFields({ detail, voice: true })).toEqual({});
  expect(detailRequestFields({ detail, enabled: false })).toEqual({});
});

test('APP-A2-4 Brief is not sent while it is hidden', () => {
  FEATURES.BRIEF_ANSWERS = false;
  expect(normaliseDetail('brief')).toBe('standard');
  expect(detailRequestFields({ detail: 'brief' })).toEqual({});
  expect(detailRequestFields({ detail: 'detailed' })).toEqual({ detail: 'detailed' });
});

test('APP-A2-3 an unknown saved preference becomes Standard', () => expect(normaliseDetail('fast')).toBe('standard'));

test('APP-A3-1 fallback notes say that Standard is shown and why', () => {
  expect(detailFallbackMessage('unverified_figures')).toMatch(/figure.*manual.*Standard answer is shown/);
  expect(detailFallbackMessage('incomplete')).toMatch(/Standard answer is shown/);
  expect(detailFallbackMessage(undefined)).toMatch(/Standard answer is shown/);
});

test('APP-A1-9 only a Brief answer has a separate Full view', () => {
  const { answerViews } = require('../utils/responseDetail');
  const brief = { ...message, fullText: 'The complete answer.' };
  expect(answerViews(brief).map(view => view.label)).toEqual(['Procedure', 'Brief', 'Full']);
  expect(answerView({ ...brief, procedureView: 'full' })).toBe('full');
  expect(displayedAnswerText({ ...brief, procedureView: 'full' })).toBe('The complete answer.');
  expect(answerViews({ ...brief, responseDetail: 'standard' }).map(view => view.label)).toEqual(['Procedure', 'Full']);
  expect(answerView({ ...brief, responseDetail: 'standard', procedureView: 'full' })).toBe('procedure');
});

test('APP-A3-2 a dropped safety detail is explained as such', () => {
  expect(detailFallbackMessage('missing_safety_detail')).toMatch(/left out a safety detail or measurement.*Standard answer is shown/);
});
