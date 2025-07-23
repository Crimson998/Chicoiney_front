import React from 'react';
import { Link } from 'react-router-dom';
import Header from '../components/Header';
import Footer from '../components/Footer';
import './Home.css';

const games = [
  {
    name: 'Crash',
    description: 'Ride the multiplier, cash out before it crashes!',
    image: '/assets/game-icons/crash.png',
    link: '/crash',
    live: true
  },
  {
    name: 'Dice',
    description: 'Coming soon!',
    image: '/assets/game-icons/dice.png',
    link: '#',
    live: false
  },
  {
    name: 'Roulette',
    description: 'Coming soon!',
    image: '/assets/game-icons/roulette.png',
    link: '#',
    live: false
  }
];

const Home = () => (
  <div className="main-bg">
    <Header />
    <section className="hero-banner">
      <h1>Welcome to StakeYotta</h1>
      <p>Play, win, and experience the thrill. Start with Crash or check out what’s coming soon!</p>
      <Link to="/crash" className="hero-cta">Play Crash Now</Link>
    </section>
    <section className="game-grid">
      {games.map(game => (
        <div className={`game-card${game.live ? '' : ' coming-soon'}`} key={game.name}>
          <img src={game.image} alt={game.name} className="game-icon" />
          <h2>{game.name}</h2>
          <p>{game.description}</p>
          {game.live ? (
            <Link to={game.link} className="play-btn">Play</Link>
          ) : (
            <span className="coming-label">Coming Soon</span>
          )}
        </div>
      ))}
    </section>
    <section className="stats-bar">
      <div className="stat-item">
        <span className="stat-label">Total Bets</span>
        <span className="stat-value">$1,234,567</span>
      </div>
      <div className="stat-item">
        <span className="stat-label">Biggest Win</span>
        <span className="stat-value">$12,345</span>
      </div>
      <div className="stat-item">
        <span className="stat-label">Players Online</span>
        <span className="stat-value">321</span>
      </div>
    </section>
    <section className="promo-section">
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

export default Home; 