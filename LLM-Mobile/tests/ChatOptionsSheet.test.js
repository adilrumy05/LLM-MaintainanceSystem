import { render, screen, fireEvent } from '@testing-library/react-native';
import ChatOptionsSheet from '../components/ChatOptionsSheet';
import { FEATURES } from '../constants/featureFlags';

const props = (extra = {}) => ({
  visible: true, onClose: jest.fn(),
  animate: { value: false, onChange: jest.fn() },
  detail: { value: 'standard', onChange: jest.fn() },
  filter: { label: null, onOpen: jest.fn(), onClear: jest.fn() },
  handsFree: { active: false, disabled: false, onToggle: jest.fn() },
  onReport: jest.fn(),
  ...extra,
});

beforeEach(() => { FEATURES.BRIEF_ANSWERS = false; });
afterAll(() => { FEATURES.BRIEF_ANSWERS = false; });

test('the animation notice is always shown, whether the switch is off or on', async () => {
  const off = props();
  const view = await render(<ChatOptionsSheet {...off} />);
  expect(screen.getByText(/An animation may not be produced/)).toBeTruthy();
  expect(screen.getByText(/schematic, not to scale/)).toBeTruthy();
  expect(screen.getByText(/costs a few cents/)).toBeTruthy();
  expect(screen.getByRole('switch').props.accessibilityState.checked).toBe(false);
  await fireEvent.press(screen.getByRole('switch'));
  expect(off.animate.onChange).toHaveBeenCalledWith(true);
  await view.rerender(<ChatOptionsSheet {...props({ animate: { value: true, onChange: off.animate.onChange } })} />);
  expect(screen.getByText(/An animation may not be produced/)).toBeTruthy();
  await fireEvent.press(screen.getByRole('switch'));
  expect(off.animate.onChange).toHaveBeenLastCalledWith(false);
});

test('response detail offers Standard and Detailed, and Brief only while it is offered', async () => {
  const given = props();
  const view = await render(<ChatOptionsSheet {...given} />);
  expect(screen.getAllByRole('radio').map(radio => radio.props.accessibilityLabel)).toEqual(['Standard', 'Detailed']);
  expect(screen.getByText(/not your skill level/)).toBeTruthy();
  await fireEvent.press(screen.getByRole('radio', { name: 'Detailed' }));
  expect(given.detail.onChange).toHaveBeenCalledWith('detailed');
  FEATURES.BRIEF_ANSWERS = true;
  await view.rerender(<ChatOptionsSheet {...props()} />);
  expect(screen.getAllByRole('radio')).toHaveLength(3);
});

test('a feature that is switched off has no row', async () => {
  await render(<ChatOptionsSheet {...props({ animate: null, detail: null })} />);
  expect(screen.queryByRole('switch')).toBeNull();
  expect(screen.queryByRole('radio')).toBeNull();
  expect(screen.getByText('Manual filter')).toBeTruthy();
});

test('settings cannot be changed until they have loaded', async () => {
  const given = props({ settingsDisabled: true });
  await render(<ChatOptionsSheet {...given} />);
  expect(screen.getByRole('switch').props.accessibilityState.disabled).toBe(true);
  expect(screen.getByRole('radio', { name: 'Detailed' }).props.accessibilityState.disabled).toBe(true);
});

test('filter, hands-free and report close the sheet and hand over', async () => {
  const given = props();
  await render(<ChatOptionsSheet {...given} />);
  expect(screen.getByText('All models (no filter)')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Choose manual filter'));
  expect(given.filter.onOpen).toHaveBeenCalled();
  await fireEvent.press(screen.getByLabelText('Start hands-free'));
  expect(given.handsFree.onToggle).toHaveBeenCalled();
  await fireEvent.press(screen.getByLabelText('Report a problem'));
  expect(given.onReport).toHaveBeenCalled();
  expect(given.onClose).toHaveBeenCalledTimes(3);
});

test('a chosen filter is named and can be cleared; hands-free shows Stop while running', async () => {
  const given = props({ filter: { label: 'CS-S10TKH', onOpen: jest.fn(), onClear: jest.fn() }, handsFree: { active: true, disabled: false, onToggle: jest.fn() } });
  await render(<ChatOptionsSheet {...given} />);
  expect(screen.getByText('CS-S10TKH')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Clear manual filter'));
  expect(given.filter.onClear).toHaveBeenCalled();
  expect(screen.getByLabelText('Stop hands-free')).toBeTruthy();
});
