import React, { useState } from 'react';
import Header from '../components/Header';
import Footer from '../components/Footer';
import './Home.css';
import axios from 'axios';

const API_BASE_URL = 'https://web-production-fc04.up.railway.app';

const Coinflip = () => {
  const [betAmount, setBetAmount] = useState(10);
  const [guess, setGuess] = useState('heads');
  const [result, setResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [credits, setCredits] = useState(null);

  const token = localStorage.getItem('token');

  const handlePlay = async () => {
    setIsLoading(true);
    setError('');
    setResult(null);
    try {
      const response = await axios.post(
        `${API_BASE_URL}/coinflip/play`,
        { bet_amount: parseFloat(betAmount), guess },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setResult(response.data);
      setCredits(response.data.credits);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to play coinflip');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="main-bg">
      <Header />
      <div style={{ margin: '2rem auto', maxWidth: 420 }}>
        <div className="auth-card" style={{ textAlign: 'center', margin: '0 auto' }}>
          <img src="https://upload.wikimedia.org/wikipedia/commons/8/89/HD_transparent_picture.png" alt="Coin" className="game-icon" style={{ width: 64, height: 64, marginBottom: 16 }} />
          <h2>Coinflip</h2>
          <p>Double or nothing! Pick heads or tails and try your luck.</p>
          <div style={{ margin: '1.5rem 0' }}>
            <label className="bet-label">Bet Amount:</label>
            <input
              type="number"
              value={betAmount}
              onChange={e => setBetAmount(e.target.value)}
              min="1"
              max="1000"
              step="1"
              className="bet-input"
              style={{ width: 120, marginLeft: 8 }}
              disabled={isLoading}
            />
          </div>
          <div style={{ margin: '1rem 0' }}>
            <label>
              <input
                type="radio"
                name="guess"
                value="heads"
                checked={guess === 'heads'}
                onChange={() => setGuess('heads')}
                disabled={isLoading}
              />
              Heads
            </label>
            <label style={{ marginLeft: 24 }}>
              <input
                type="radio"
                name="guess"
                value="tails"
                checked={guess === 'tails'}
                onChange={() => setGuess('tails')}
                disabled={isLoading}
              />
              Tails
            </label>
          </div>
          <button
            className="play-btn"
            style={{ width: '100%', margin: '1.5rem 0' }}
            onClick={handlePlay}
            disabled={isLoading}
          >
            {isLoading ? 'Flipping...' : 'Flip Coin!'}
          </button>
          {error && <div className="error-message">{error}</div>}
          {result && (
            <div style={{ marginTop: 16 }}>
              <div><strong>Result:</strong> {result.result}</div>
              <div><strong>{result.win ? 'You Win!' : 'You Lose!'}</strong></div>
              <div><strong>Hash:</strong> <span style={{ fontSize: 12 }}>{result.hash}</span></div>
              <div><strong>Credits:</strong> ${result.credits?.toFixed(2)}</div>
            </div>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default Coinflip; 