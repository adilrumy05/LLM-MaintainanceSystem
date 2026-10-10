import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import ProcedureViewer from '../components/ProcedureViewer';
import { capturePhotos } from '../services/photo';
jest.mock('../services/photo', () => ({ capturePhotos: jest.fn() }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
const steps = [{ title: 'Clean floor', description: 'Sweep the floor', warningLevel: 'none', photoRequired: true }, { title: 'Finish', description: 'Finish', warningLevel: 'none' }];
function Harness() {
  const [state, setState] = React.useState({ currentStep: 0, completedSteps: [], overviewOpen: false });
  return <ProcedureViewer steps={steps} state={state} onChange={setState} />;
}
test('required step stays incomplete after cancellation, then completes after new capture', async () => {
  capturePhotos.mockResolvedValueOnce([]).mockResolvedValueOnce([{ uri: 'file:///new.jpg', width: 100, height: 100 }]);
  const ui = await render(<Harness />);
  await fireEvent.press(ui.getByText('Mark this step as complete'));
  expect(ui.getByText('0 of 2 completed')).toBeTruthy();
  await fireEvent.press(ui.getByText('Take Photo'));
  await waitFor(() => expect(capturePhotos).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(ui.getByText('Take Photo')).toBeTruthy());
  expect(ui.getByText('0 of 2 completed')).toBeTruthy();
  await fireEvent.press(ui.getByText('Take Photo'));
  await waitFor(() => expect(ui.getByText('PHOTO CAPTURED')).toBeTruthy());
  expect(capturePhotos).toHaveBeenLastCalledWith('camera', { limit: 1, cameraOnly: true });
  await fireEvent.press(ui.getByText('Mark this step as complete'));
  expect(ui.getByText('1 of 2 completed')).toBeTruthy();
  await fireEvent.press(ui.getByText('Next'));
  expect(ui.getByText('Step 2 of 2')).toBeTruthy();
}, 15000);


test('overview cannot skip an unfinished photo step', async () => {
  const ui = await render(<Harness />);
  await fireEvent.press(ui.getByText('View all steps'));
  await fireEvent.press(ui.getByText('Finish'));
  expect(ui.getByText('Step 1 of 2')).toBeTruthy();
});