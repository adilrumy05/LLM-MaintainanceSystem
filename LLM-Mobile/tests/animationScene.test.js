import { shapeOf, effectOf, actorsFor, stepLayout, isPlayable } from '../utils/animationScene';
import { animation } from './fixtures/animation';

test('the picture comes from the name the manual gives the part, before the suggested shape', () => {
  expect(shapeOf({ label: 'Front grille', shape: 'generic' })).toBe('cover');
  expect(shapeOf({ label: 'Holder (clamper)', shape: 'cable' })).toBe('clamp');
  expect(shapeOf({ label: 'Thing', shape: 'filter' })).toBe('filter');
  expect(shapeOf({ label: 'Thing', shape: 'made-up' })).toBe('generic');
});

test.each([
  [{ verb: 'loosen' }, 'ccw'], [{ verb: 'tighten' }, 'cw'], [{ verb: 'remove', direction: 'away' }, 'away'],
  [{ verb: 'attach', direction: 'toward' }, 'toward'], [{ verb: 'operate', verbText: 'Press' }, 'press'], [{ verb: 'other' }, 'highlight'],
])('%p is drawn as %s', (fact, effect) => expect(effectOf(fact)).toBe(effect));

test('loosening is shown before taking off, and a part that comes off knows what it comes off', () => {
  const actors = actorsFor(animation, animation.steps[0]);
  expect(actors.map(actor => [actor.part.id, actor.effect])).toEqual([['screw', 'ccw'], ['cover', 'away']]);
  expect(actors[1].source.id).toBe('board');
});

test('a part taken away has an outline where it was and an arrow leading away', () => {
  const cover = stepLayout(animation, 0).actors.find(actor => actor.key === 'cover');
  expect(cover.ghost).toBeTruthy();
  expect(cover.dx).toBeGreaterThan(0);
  expect(cover.dy).toBeLessThan(0);
  expect(cover.arrow.x2).toBeGreaterThan(cover.arrow.x1);
  expect(stepLayout(animation, 0).safety).toBe(true);
});

test('wiring is drawn one wire per connection, with the terminal numbers from the manual', () => {
  const { wiring, actors } = stepLayout(animation, 1);
  expect(actors).toEqual([]);
  expect(wiring.wires.map(wire => [wire.from, wire.to])).toEqual([['1', '1'], ['2', '2']]);
  expect(wiring).toMatchObject({ fromUnit: 'Outdoor unit', toUnit: 'Indoor unit', coloursMissing: true });
});

test('a fitted part goes toward what it is fitted onto, with its tool and its value', () => {
  const [cable] = stepLayout(animation, 2).actors;
  expect(cable).toMatchObject({ key: 'cable', effect: 'toward', tag: { text: 'secure' }, values: ['1.5 mm²'] });
  expect(cable.context.shape).toBe('board');
  expect(cable.instrument.shape).toBe('clamp');
});

test('a step with nothing to draw says so', () => {
  const bare = { ...animation, steps: [{ factIds: ['f1'], motions: [] }], captions: [[]] };
  expect(stepLayout(bare, 0)).toMatchObject({ empty: true, safety: true });
});

test('only a complete animation is playable', () => {
  expect(isPlayable(animation)).toBe(true);
  expect(isPlayable({ ...animation, captions: [] })).toBe(false);
  expect(isPlayable({ steps: [] })).toBe(false);
  expect(isPlayable(null)).toBe(false);
});
