import './LoadingScreen.css';

export default function LoadingScreen({ progress, supported }) {
  if (!supported) {
    return (
      <div className="loading-screen">
        <h2>🐼 Rusty needs a WebGPU browser</h2>
        <p>Open this in Chrome or Edge on a desktop to wake him up.</p>
      </div>
    );
  }
  return (
    <div className="loading-screen">
      <h2>🐼 Waking up Rusty…</h2>
      <div className="loading-bar"><div style={{ width: `${progress}%` }} /></div>
      <p>{progress}%</p>
    </div>
  );
}
