import React from 'react';
import Header from '../components/Header';
import Footer from '../components/Footer';
import '../pages/Home.css';

const Account = () => (
  <div className="main-bg">
    <Header />
    <section className="account-section">
      <div className="account-card">
        <h2>User Profile</h2>
        <div className="account-info">
          <div><strong>Username:</strong> Player123</div>
          <div><strong>Credits:</strong> $1,000.00</div>
          <div><strong>Games Played:</strong> 42</div>
          <div><strong>Biggest Win:</strong> $2,500</div>
        </div>
        <div className="account-settings">
          <h3>Settings</h3>
          <p>Settings coming soon...</p>
        </div>
      </div>
    </section>
    <Footer />
  </div>
);

export default Account; 