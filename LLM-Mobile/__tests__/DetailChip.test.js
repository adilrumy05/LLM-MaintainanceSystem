import { render, screen, fireEvent } from '@testing-library/react-native';
import DetailChip from '../components/DetailChip';

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

test('picker cannot open while disabled', async () => {
  await render(<DetailChip value="standard" onChange={jest.fn()} disabled />);
  await fireEvent.press(screen.getByLabelText('Response detail: Standard'));
  expect(screen.queryByRole('radio', { name: 'Brief' })).toBeNull();
});
