import React, { useState, useRef } from 'react';
import Header from '../components/Header';
import Footer from '../components/Footer';
import '../pages/Home.css';
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://web-production-fc04.up.railway.app';
//1
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
  const [createdAt, setCreatedAt] = useState(null);
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
    setCreatedAt(null);
    try {
      const res = await axios.post(
        `${API_BASE_URL}/crash/start`,
        { bet_amount: parseFloat(betAmount) },
        { headers }
      );
      setRoundId(res.data.id);
      setCrashMultiplier(res.data.crash_multiplier);
      setCreatedAt(res.data.created_at);
      setGameActive(true);
      setMultiplier(1.0);
      animateMultiplier(res.data.crash_multiplier, res.data.created_at);
    } catch (err) {
      setMessage(err.response?.data?.detail || 'Error starting game');
    } finally {
      setIsLoading(false);
    }
  };

  // Calculate multiplier based on backend created_at and real time, using backend's formula
  const animateMultiplier = (crashAt, createdAtStr) => {
    if (!createdAtStr) return;
    let createdAtTime = new Date(createdAtStr).getTime();
    if (isNaN(createdAtTime) && createdAtStr.endsWith('Z') === false) {
      createdAtTime = new Date(createdAtStr + 'Z').getTime();
    }
    // Calculate the exact time (in ms) when the game should crash
    const secondsToCrash = Math.max(0, (crashAt - 1.0) / 0.1);
    const crashTime = createdAtTime + secondsToCrash * 1000;
    intervalRef.current = setInterval(() => {
      const now = Date.now();
      const elapsed = Math.max(0, (now - createdAtTime) / 1000);
      let current = 1.0 + 0.1 * elapsed;
      if (now >= crashTime || current >= crashAt) {
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
      // Calculate the real-time multiplier at the moment of cashout
      let cashoutMultiplier = multiplier;
      if (createdAt) {
        const createdAtTime = new Date(createdAt).getTime();
        const now = Date.now();
        const elapsed = (now - createdAtTime) / 1000;
        cashoutMultiplier = 1.0 + 0.1 * elapsed;
      }
      if (crashMultiplier && cashoutMultiplier >= crashMultiplier) {
        setMessage('Game has already crashed!');
        setGameActive(false);
        clearInterval(intervalRef.current);
        setTimeout(() => handleCrash(), 500);
        setIsLoading(false);
        return;
      }
      const res = await axios.post(
        `${API_BASE_URL}/crash/cashout`,
        { round_id: roundId, cash_out_multiplier: cashoutMultiplier },
        { headers }
      );
      clearInterval(intervalRef.current);
      setResult({ ...res.data, win: true });
      setCashedOut(true);
      setGameActive(false);
      setCredits(res.data.winnings ? res.data.winnings : null);
      setMessage(`Cashed out at ${cashoutMultiplier.toFixed(2)}x!`);
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
            {credits !== null && <div>Credits: <b>${credits.toFixed(2)}</b></div>}
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
};

export default Crash;