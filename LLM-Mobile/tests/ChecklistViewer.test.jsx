import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ChecklistViewer from '../components/ChecklistViewer';
import ProcedureViewer from '../components/ProcedureViewer';
jest.mock('../services/photo', () => ({ capturePhotos: jest.fn() }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
const steps = [
  { title: 'Insert sleeve', description: 'Insert into wall.', warningLevel: 'none', photoRequired: true },
  { title: 'Fix bushing', description: 'Fit to sleeve.', warningLevel: 'none' },
  { title: 'Cut sleeve', description: 'Leave 15 mm.', warningLevel: 'caution' },
];
function Harness({ guided = false }) {
  const [state, setState] = React.useState({ currentStep: 0, completedSteps: [] });
  const Viewer = guided ? ProcedureViewer : ChecklistViewer;
  return <Viewer steps={steps} state={state} onChange={setState} />;
}
test('all items are visible and can be checked out of order without completing a photo step', async () => {
  const ui = await render(<Harness />);
  expect(ui.getByText('Insert into wall.')).toBeTruthy();
  expect(ui.getByText('Leave 15 mm.')).toBeTruthy();
  expect(ui.getByText('0/3 completed')).toBeTruthy();
  await fireEvent.press(ui.getByRole('checkbox', { name: 'Cut sleeve' }));
  expect(ui.getByText('1/3 completed')).toBeTruthy();
  expect(ui.queryByText('All items completed')).toBeNull();
  await fireEvent.press(ui.getByRole('checkbox', { name: 'Fix bushing' }));
  expect(ui.getByText('2/3 completed')).toBeTruthy();
  await fireEvent.press(ui.getByRole('checkbox', { name: 'Cut sleeve' }));
  expect(ui.getByText('1/3 completed')).toBeTruthy();
});
test('Next and Previous leave unchecked steps incomplete, including required photo steps', async () => {
  const ui = await render(<Harness guided />);
  await fireEvent.press(ui.getByText('Next'));
  expect(ui.getByText('Step 2 of 3')).toBeTruthy();
  expect(ui.getByText('0 of 3 completed')).toBeTruthy();
  await fireEvent.press(ui.getByText('Previous'));
  expect(ui.getByText('Step 1 of 3')).toBeTruthy();
  expect(ui.getByText('0 of 3 completed')).toBeTruthy();
});
