import React, { useState, useRef } from 'react';
import Header from '../components/Header';
import Footer from '../components/Footer';
import '../pages/Home.css';
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://web-production-fc04.up.railway.app';

const Crash = () => {
  const [betAmount, setBetAmount] = useState('');
  const [result, setResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [multiplier, setMultiplier] = useState(1.0);
  const [crashMultiplier, setCrashMultiplier] = useState(null);
  const [gameActive, setGameActive] = useState(false);
  const [cashedOut, setCashedOut] = useState(false);
  const [credits, setCredits] = useState(null);
  const [roundId, setRoundId] = useState(null);
  const [token] = useState(localStorage.getItem('token'));
  const intervalRef = useRef(null);

  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  const handleStart = async () => {
    setIsLoading(true);
    setMessage('');
    setResult(null);
    setCashedOut(false);
    setCrashMultiplier(null);
    setMultiplier(1.0);
    setGameActive(false);
    try {
      const res = await axios.post(
        `${API_BASE_URL}/crash/start`,
        { bet_amount: parseFloat(betAmount) },
        { headers }
      );
      setRoundId(res.data.id);
      setCrashMultiplier(res.data.crash_multiplier);
      setGameActive(true);
      setMultiplier(1.0);
      animateMultiplier(res.data.crash_multiplier);
    } catch (err) {
      setMessage(err.response?.data?.detail || 'Error starting game');
    } finally {
      setIsLoading(false);
    }
  };

  const animateMultiplier = (crashAt) => {
    let current = 1.0;
    const start = Date.now();
    intervalRef.current = setInterval(() => {
      const elapsed = (Date.now() - start) / 1000;
      current = 1.0 + 0.1 * elapsed;
      if (current >= crashAt) {
        clearInterval(intervalRef.current);
        setMultiplier(crashAt);
        setGameActive(false);
        setTimeout(() => handleCrash(), 500);
      } else {
        setMultiplier(current);
      }
    }, 50);
  };

  const handleCashout = async () => {
    if (!roundId) return;
    setIsLoading(true);
    setMessage('');
    try {
      const res = await axios.post(
        `${API_BASE_URL}/crash/cashout`,
        { round_id: roundId, cash_out_multiplier: multiplier },
        { headers }
      );
      clearInterval(intervalRef.current);
      setResult({ ...res.data, win: true });
      setCashedOut(true);
      setGameActive(false);
      setCredits(res.data.winnings ? res.data.winnings : null);
      setMessage(`Cashed out at ${multiplier.toFixed(2)}x!`);
    } catch (err) {
      setMessage(err.response?.data?.detail || 'Error cashing out');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCrash = async () => {
    setGameActive(false);
    setCashedOut(false);
    setMessage('Crashed!');
    if (!roundId) return;
    try {
      const res = await axios.get(
        `${API_BASE_URL}/crash/round/${roundId}`,
        { headers }
      );
      setResult({ ...res.data, win: false });
      setCredits(null);
    } catch (err) {
      // ignore
    }
  };

  return (
    <div className="main-bg">
      <Header />
      <div style={{ margin: '2rem auto', maxWidth: 500, background: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: 32 }}>
        <h1 style={{ textAlign: 'center' }}>Crash</h1>
        <div style={{ marginBottom: 16 }}>
          <label>Bet Amount ($): </label>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={betAmount}
            onChange={e => setBetAmount(e.target.value)}
            disabled={gameActive || isLoading}
            style={{ width: 100, marginRight: 16 }}
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          {!gameActive ? (
            <button className="play-btn" onClick={handleStart} disabled={isLoading || !betAmount}>Start Game</button>
          ) : (
            <button className="play-btn" onClick={handleCashout} disabled={isLoading || cashedOut}>Cash Out</button>
          )}
        </div>
        {message && <div style={{ color: cashedOut ? 'green' : 'red', marginBottom: 8 }}>{message}</div>}
        {gameActive && (
          <div style={{ marginTop: 16, background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 32, fontWeight: 'bold', color: multiplier >= (crashMultiplier || 2) ? 'red' : '#ffd700' }}>
              {multiplier.toFixed(2)}x
            </div>
            <div>Live Multiplier</div>
          </div>
        )}
        {result && !gameActive && (
          <div style={{ marginTop: 16, background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 16 }}>
            <div>Result: <b>{result.win ? 'Cashed Out' : 'Crashed'}</b></div>
            <div>Bet: <b>${result.bet_amount ? result.bet_amount.toFixed(2) : 0}</b></div>
            <div>Multiplier: <b>{result.cashed_out_at ? result.cashed_out_at.toFixed(2) : result.crashed_at ? result.crashed_at.toFixed(2) : ''}x</b></div>
            {result.win && <div>Winnings: <b>${result.winnings ? result.winnings.toFixed(2) : ''}</b></div>}
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
};

export default Crash;