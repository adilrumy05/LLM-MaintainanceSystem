import { render, screen, fireEvent } from '@testing-library/react-native';
import AnimateChip from '../components/AnimateChip';

test('the first time, the notice is shown and nothing is turned on until it is accepted', async () => {
  const onChange = jest.fn();
  await render(<AnimateChip value={false} introSeen={false} onChange={onChange} />);
  expect(screen.getByRole('switch').props.accessibilityState.checked).toBe(false);
  await fireEvent.press(screen.getByRole('switch'));
  expect(screen.getByText(/An animation may not be produced/)).toBeTruthy();
  expect(screen.getByText(/costs a few cents/)).toBeTruthy();
  expect(onChange).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByLabelText('Not now'));
  expect(onChange).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('switch'));
  await fireEvent.press(screen.getByLabelText('Turn on animations'));
  expect(onChange).toHaveBeenCalledWith(true);
});

test('after the notice has been read the chip just switches', async () => {
  const onChange = jest.fn();
  const view = await render(<AnimateChip value={false} introSeen onChange={onChange} />);
  await fireEvent.press(screen.getByRole('switch'));
  expect(onChange).toHaveBeenLastCalledWith(true);
  expect(screen.queryByText(/may not be produced/)).toBeNull();
  await view.rerender(<AnimateChip value introSeen onChange={onChange} />);
  expect(screen.getByText('Animate: on')).toBeTruthy();
  await fireEvent.press(screen.getByRole('switch'));
  expect(onChange).toHaveBeenLastCalledWith(false);
});
