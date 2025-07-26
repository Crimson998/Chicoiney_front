import React, { useState } from 'react';
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
    name: 'Coinflip',
    description: 'Pick heads or tails, let it ride or cash out!',
    image: '/assets/game-icons/dice.png',
    link: '/coinflip',
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

const Home = () => {
  const [verificationData, setVerificationData] = useState({
    serverSeed: '',
    clientSeed: '',
    nonce: '',
    gameType: 'crash'
  });
  const [verificationResult, setVerificationResult] = useState(null);

  const verifyFairness = () => {
    const { serverSeed, clientSeed, nonce, gameType } = verificationData;
    
    if (!serverSeed || !clientSeed || !nonce) {
      setVerificationResult({ error: 'Please fill in all fields' });
      return;
    }

    try {
      const nonceInt = parseInt(nonce);
      if (isNaN(nonceInt)) {
        setVerificationResult({ error: 'Nonce must be a number' });
        return;
      }

      // Create verification string
      const verificationString = `${serverSeed}:${clientSeed}:${nonceInt}`;
      
      // Hash the verification string
      const crypto = require('crypto');
      const hash = crypto.createHash('sha256').update(verificationString).digest('hex');
      const h = parseInt(hash, 16);

      let result;
      if (gameType === 'crash') {
        // 5% house edge: 1 in 20 games crash at 1.00x
        if (h % 20 === 0) {
          result = 1.00;
        } else {
          const X = ((h >> 8) % (10 ** 16)) / (10 ** 16);
          result = Math.floor((1 / (1 - X)) * 100) / 100;
          result = Math.min(result, 1000000.0);
        }
        setVerificationResult({
          success: true,
          gameType: 'crash',
          crashMultiplier: result,
          verificationString,
          hash
        });
      } else if (gameType === 'coinflip') {
        result = h % 2 === 0 ? 'heads' : 'tails';
        setVerificationResult({
          success: true,
          gameType: 'coinflip',
          result,
          verificationString,
          hash
        });
      }
    } catch (error) {
      setVerificationResult({ error: 'Verification failed: ' + error.message });
    }
  };

  return (
    <div className="main-bg">
      <Header />
      <section className="hero-banner">
        <h1>Welcome to StakeYotta</h1>
        <p>Play, win, and experience the thrill. Start with Crash or check out what's coming soon!</p>
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
      
      {/* Provably Fair Section */}
      <section style={{ padding: '2rem', background: 'rgba(0,0,0,0.3)', margin: '2rem 0' }}>
        <h2 style={{ textAlign: 'center', marginBottom: '1rem' }}>🔒 Provably Fair System</h2>
        <div style={{ maxWidth: 800, margin: '0 auto', textAlign: 'center' }}>
          <p style={{ marginBottom: '1rem' }}>
            Our games use a provably fair system that ensures complete transparency and fairness. 
            Every game result can be verified using cryptographic methods.
          </p>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginTop: '2rem' }}>
            <div style={{ textAlign: 'left' }}>
              <h3>How It Works:</h3>
              <ol style={{ textAlign: 'left' }}>
                <li>Server generates a random seed and commits to its hash</li>
                <li>Player provides their own client seed</li>
                <li>Game result is determined by combining both seeds</li>
                <li>Server reveals the original seed after the game</li>
                <li>Player can verify the result independently</li>
              </ol>
            </div>
            
            <div style={{ textAlign: 'left' }}>
              <h3>Verification Tool:</h3>
              <div style={{ marginBottom: '1rem' }}>
                <label>Game Type: </label>
                <select 
                  value={verificationData.gameType} 
                  onChange={(e) => setVerificationData({...verificationData, gameType: e.target.value})}
                  style={{ marginLeft: '0.5rem', padding: '0.25rem' }}
                >
                  <option value="crash">Crash</option>
                  <option value="coinflip">Coinflip</option>
                </select>
              </div>
              <div style={{ marginBottom: '0.5rem' }}>
                <input
                  type="text"
                  placeholder="Server Seed"
                  value={verificationData.serverSeed}
                  onChange={(e) => setVerificationData({...verificationData, serverSeed: e.target.value})}
                  style={{ width: '100%', padding: '0.5rem', marginBottom: '0.5rem' }}
                />
              </div>
              <div style={{ marginBottom: '0.5rem' }}>
                <input
                  type="text"
                  placeholder="Client Seed"
                  value={verificationData.clientSeed}
                  onChange={(e) => setVerificationData({...verificationData, clientSeed: e.target.value})}
                  style={{ width: '100%', padding: '0.5rem', marginBottom: '0.5rem' }}
                />
              </div>
              <div style={{ marginBottom: '0.5rem' }}>
                <input
                  type="number"
                  placeholder="Nonce"
                  value={verificationData.nonce}
                  onChange={(e) => setVerificationData({...verificationData, nonce: e.target.value})}
                  style={{ width: '100%', padding: '0.5rem', marginBottom: '0.5rem' }}
                />
              </div>
              <button 
                onClick={verifyFairness}
                style={{ 
                  padding: '0.5rem 1rem', 
                  background: '#4CAF50', 
                  color: 'white', 
                  border: 'none', 
                  borderRadius: 4,
                  cursor: 'pointer'
                }}
              >
                Verify Result
              </button>
            </div>
          </div>
          
          {verificationResult && (
            <div style={{ 
              marginTop: '1rem', 
              padding: '1rem', 
              background: verificationResult.error ? 'rgba(255,0,0,0.1)' : 'rgba(0,255,0,0.1)', 
              borderRadius: 8 
            }}>
              {verificationResult.error ? (
                <div style={{ color: '#f44336' }}>❌ {verificationResult.error}</div>
              ) : (
                <div>
                  <div style={{ color: '#4CAF50', fontWeight: 'bold' }}>✅ Verification Successful!</div>
                  <div>Game Type: {verificationResult.gameType}</div>
                  {verificationResult.gameType === 'crash' && (
                    <div>Crash Multiplier: {verificationResult.crashMultiplier.toFixed(2)}x</div>
                  )}
                  {verificationResult.gameType === 'coinflip' && (
                    <div>Result: {verificationResult.result}</div>
                  )}
                  <div style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>
                    Verification String: <code>{verificationResult.verificationString}</code>
                  </div>
                </div>
              )}
            </div>
          )}
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
};

export default Home; 