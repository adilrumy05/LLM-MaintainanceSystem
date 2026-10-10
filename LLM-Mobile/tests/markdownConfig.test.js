import { selectsInline, makeMarkdownRules } from '../constants/markdownConfig';
import { FEATURES } from '../constants/featureFlags';

// Found on the iPhone: with selectable answer text, the last line of a wrapped
// list item was sometimes not drawn ("Loosen the screw to take off the control",
// then a blank line). iOS cannot select part of a <Text> anyway, so it does not
// get the selectable rule; it has the "Select text" sheet instead.

afterEach(() => { FEATURES.CHAT_SELECT = true; });

test('APP-B2-3 answer text is selectable in place on Android and web, not on iOS', () => {
  expect(selectsInline('android')).toBe(true);
  expect(selectsInline('web')).toBe(true);
  expect(selectsInline('ios')).toBe(false);
});

test('APP-B2-4 the iOS build renders answer paragraphs with the default, non-selectable rule', () => {
  // jest-expo runs as iOS by default.
  expect(selectsInline()).toBe(false);
  expect(makeMarkdownRules({}).textgroup).toBeUndefined();
  expect(makeMarkdownRules({}).table).toBeDefined();
});

test('APP-B2-5 switching the feature off removes in-place selection everywhere', () => {
  FEATURES.CHAT_SELECT = false;
  expect(selectsInline('android')).toBe(false);
});
