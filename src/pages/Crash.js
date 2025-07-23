import React from 'react';
import Header from '../components/Header';
import Footer from '../components/Footer';
import '../pages/Home.css';
import App from '../App';

const Crash = () => (
  <div className="main-bg">
    <Header />
    <div style={{ margin: '2rem auto', maxWidth: 1200 }}>
      <App />
    </div>
    <Footer />
  </div>
);

export default Crash; 