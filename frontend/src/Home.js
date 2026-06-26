import React from 'react';
import { Link } from 'react-router-dom';
import './Home.css'; // We'll add this next

const Home = () => {
  return (
    <div className="home-container">
      <h1 className="home-header">Meet Rusty: Your Learning Buddy!</h1>
      <p className="home-subtext">
        A friendly red panda who helps with homework, spelling, and more!
      </p>
      <Link to="/app" className="home-cta">Try Demo Now</Link>
    </div>
  );
};

export default Home;