import { render, screen, fireEvent } from '@testing-library/react-native';
import DetailChip from '../components/DetailChip';
import { FEATURES } from '../constants/featureFlags';

beforeEach(() => { FEATURES.BRIEF_ANSWERS = true; });
afterAll(() => { FEATURES.BRIEF_ANSWERS = false; });

test('picker shows all modes and describes the distinction from skill level', async () => {
  const onChange = jest.fn();
  await render(<DetailChip value="standard" onChange={onChange} />);
  await fireEvent.press(screen.getByLabelText('Response detail: Standard'));
  expect(screen.getByText(/not your skill level/)).toBeTruthy();
  expect(screen.getAllByRole('radio')).toHaveLength(3);
  await fireEvent.press(screen.getByRole('radio', { name: 'Brief' }));
  expect(onChange).toHaveBeenCalledWith('brief');
  expect(screen.queryByRole('radio', { name: 'Brief' })).toBeNull();
});

test('Brief is not offered while it is hidden, and a saved Brief choice shows as Standard', async () => {
  FEATURES.BRIEF_ANSWERS = false;
  await render(<DetailChip value="brief" onChange={jest.fn()} />);
  await fireEvent.press(screen.getByLabelText('Response detail: Standard'));
  expect(screen.getAllByRole('radio').map(radio => radio.props.accessibilityLabel)).toEqual(['Standard', 'Detailed']);
});

test('picker cannot open while disabled', async () => {
  await render(<DetailChip value="standard" onChange={jest.fn()} disabled />);
  await fireEvent.press(screen.getByLabelText('Response detail: Standard'));
  expect(screen.queryByRole('radio', { name: 'Brief' })).toBeNull();
});
