import React from 'react';
import Header from '../components/Header';
import Footer from '../components/Footer';
import '../pages/Home.css';

const Promotions = () => (
  <div className="main-bg">
    <Header />
    <section className="promo-section" style={{ marginTop: '2.5rem' }}>
      <div className="promo-card">
        <h3>Welcome Bonus</h3>
        <p>Sign up now and get a 100% bonus on your first deposit!</p>
      </div>
      <div className="promo-card">
        <h3>Referral Program</h3>
        <p>Invite friends and earn rewards for every player you bring in.</p>
      </div>
    </section>
    <Footer />
  </div>
);

export default Promotions; 