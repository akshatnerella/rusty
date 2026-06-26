import { render, screen } from '@testing-library/react';
import LoadingScreen from './LoadingScreen';

test('shows unsupported message when WebGPU missing', () => {
  render(<LoadingScreen progress={0} supported={false} />);
  expect(screen.getByText(/WebGPU/i)).toBeInTheDocument();
});

test('shows progress when supported', () => {
  render(<LoadingScreen progress={42} supported={true} />);
  expect(screen.getByText(/42/)).toBeInTheDocument();
});
