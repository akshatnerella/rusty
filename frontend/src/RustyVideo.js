import React, { useState, useEffect, useRef } from 'react';

const VIDEOS = {
  neutral: '/videos/neutral.mp4',
  happy: '/videos/happy.mp4',
  sad: '/videos/sad.mp4',
};

const RustyVideo = ({ emotion: propEmotion }) => {
  const [currentEmotion, setCurrentEmotion] = useState('neutral');
  const videoRef = useRef(null);

  useEffect(() => {
    if (propEmotion && VIDEOS[propEmotion] && propEmotion !== currentEmotion) {
      setCurrentEmotion(propEmotion);
    }
  }, [propEmotion]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleVideoEnd = () => {
    if (currentEmotion !== 'neutral') setCurrentEmotion('neutral');
  };

  return (
    <div className="video-container">
      <video
        ref={videoRef}
        className="rusty-video"
        src={VIDEOS[currentEmotion] || VIDEOS.neutral}
        autoPlay
        loop={currentEmotion === 'neutral'}
        muted
        onEnded={handleVideoEnd}
      />
      <div className="video-overlay">
        <span>Rusty the Red Panda</span>
      </div>
    </div>
  );
};

export default RustyVideo;
