import { render } from '@testing-library/react';
import RustyVideo from './RustyVideo';

test('renders the video for the given emotion', () => {
  const { container } = render(<RustyVideo emotion="happy" />);
  const video = container.querySelector('video.rusty-video');
  expect(video.getAttribute('src')).toContain('happy.mp4');
});

test('falls back to neutral for unknown emotion', () => {
  const { container } = render(<RustyVideo emotion="angry" />);
  const video = container.querySelector('video.rusty-video');
  expect(video.getAttribute('src')).toContain('neutral.mp4');
});
