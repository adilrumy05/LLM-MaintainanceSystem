import { render, screen, fireEvent } from '@testing-library/react-native';
import QuoteChip from '../components/QuoteChip';

test('APP-B3-2 shows the quoted passage and removes it on ×', async () => {
  const onRemove = jest.fn();
  await render(<QuoteChip text="Secure the cable with the holder." onRemove={onRemove} />);

  expect(screen.getByText('“Secure the cable with the holder.”')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Remove quote'));
  expect(onRemove).toHaveBeenCalledTimes(1);
});

test('APP-B3-3 renders nothing when there is no quote', async () => {
  await render(<QuoteChip text={null} onRemove={jest.fn()} />);
  expect(screen.queryByText('Replying to')).toBeNull();
});
