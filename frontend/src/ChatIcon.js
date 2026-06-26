import React from 'react';

const ChatIcon = ({ onClick }) => {
  return (
    <button className="chat-icon" onClick={onClick}>
      <img src="/chat.png" alt="Chat with Rusty" width="24" height="24" />
    </button>
  );
};

export default ChatIcon;