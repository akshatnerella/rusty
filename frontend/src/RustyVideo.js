import React, { useState, useEffect, useRef } from 'react';

const RustyVideo = ({ emotion: propEmotion, onCaptureImage }) => {
  const [currentEmotion, setCurrentEmotion] = useState('neutral');
  const videoRef = useRef(null);
  const cameraRef = useRef(null);
  const canvasRef = useRef(null); // For capturing image

  const videoSources = {
    neutral: '/videos/neutral.mp4',
    happy: '/videos/happy.mp4',
    sad: '/videos/sad.mp4',
    angry: '/videos/angry.mp4',
  };

  // Sync local emotion with prop
  useEffect(() => {
    if (propEmotion && propEmotion !== currentEmotion) {
      setCurrentEmotion(propEmotion);
    }
  }, [propEmotion]);

  const handleVideoEnd = () => {
    if (currentEmotion !== 'neutral') {
      setCurrentEmotion('neutral');
    }
  };

  useEffect(() => {
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
        if (cameraRef.current) {
          cameraRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error('Error accessing camera:', err.name, err.message);
        if (err.name === 'NotReadableError') {
          console.error('Camera might be in use by another app or unavailable.');
        } else if (err.name === 'NotAllowedError') {
          console.error('Camera permission denied. Check browser/OS settings.');
        } else if (err.name === 'NotFoundError') {
          console.error('No camera found on this device.');
        }
      }
    };

    startCamera();

    return () => {
      if (cameraRef.current && cameraRef.current.srcObject) {
        const tracks = cameraRef.current.srcObject.getTracks();
        tracks.forEach(track => track.stop());
      }
    };
  }, []);

  // Capture image from webcam
  const captureImage = () => {
    if (!cameraRef.current || !canvasRef.current) return null;

    const video = cameraRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        resolve(blob);
      }, 'image/jpeg', 0.9); // JPEG, 90% quality
    });
  };

  // Trigger capture when recording starts (via parent)
  useEffect(() => {
    if (onCaptureImage) {
      captureImage().then((blob) => {
        if (blob) onCaptureImage(blob);
      });
    }
  }, [onCaptureImage]);

  return (
    <div className="video-container">
      <video
        ref={videoRef}
        className="rusty-video"
        src={videoSources[currentEmotion] || videoSources.neutral}
        autoPlay
        loop={currentEmotion === 'neutral'}
        muted
        onEnded={handleVideoEnd}
      />
      <div className="video-overlay">
        <span>Rusty the Red Panda</span>
      </div>
      <video ref={cameraRef} className="camera-feed" autoPlay muted />
      <canvas ref={canvasRef} style={{ display: 'none' }} /> {/* Hidden canvas */}
    </div>
  );
};

export default RustyVideo;