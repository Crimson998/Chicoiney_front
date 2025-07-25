import React, { useState } from 'react';
import Header from '../components/Header';
import Footer from '../components/Footer';
import '../pages/Home.css';
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://web-production-fc04.up.railway.app';

const Coinflip = () => {
  const [betAmount, setBetAmount] = useState('');
  const [guess, setGuess] = useState('heads');
  const [result, setResult] = useState(null);
  const [canRide, setCanRide] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [flips, setFlips] = useState(0);
  const [token] = useState(localStorage.getItem('token'));

  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  const handleStart = async () => {
    setIsLoading(true);
    setMessage('');
    try {
      const res = await axios.post(
        `${API_BASE_URL}/coinflip/start`,
        { bet_amount: parseFloat(betAmount), guess },
        { headers }
      );
      setResult(res.data);
      setCanRide(res.data.can_ride);
      setFlips(1);
    } catch (err) {
      setMessage(err.response?.data?.detail || 'Error starting game');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRide = async () => {
    setIsLoading(true);
    setMessage('');
    try {
      const res = await axios.post(
        `${API_BASE_URL}/coinflip/ride`,
        { guess },
        { headers }
      );
      setResult(res.data);
      setCanRide(res.data.can_ride);
      setFlips(flips + 1);
    } catch (err) {
      setMessage(err.response?.data?.detail || 'Error letting it ride');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCashout = async () => {
    setIsLoading(true);
    setMessage('');
    try {
      const res = await axios.post(
        `${API_BASE_URL}/coinflip/cashout`,
        {},
        { headers }
      );
      setResult({ ...result, payout: res.data.payout, credits: res.data.credits });
      setCanRide(false);
      setMessage(`Cashed out! You won $${res.data.payout.toFixed(2)}`);
    } catch (err) {
      setMessage(err.response?.data?.detail || 'Error cashing out');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="main-bg">
      <Header />
      <div style={{ margin: '2rem auto', maxWidth: 500, background: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: 32 }}>
        <h1 style={{ textAlign: 'center' }}>Coinflip</h1>
        <div style={{ marginBottom: 16 }}>
          <label>Bet Amount ($): </label>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={betAmount}
            onChange={e => setBetAmount(e.target.value)}
            disabled={canRide || isLoading}
            style={{ width: 100, marginRight: 16 }}
          />
          <select value={guess} onChange={e => setGuess(e.target.value)} disabled={canRide || isLoading}>
            <option value="heads">Heads</option>
            <option value="tails">Tails</option>
          </select>
        </div>
        <div style={{ marginBottom: 16 }}>
          {!canRide ? (
            <button className="play-btn" onClick={handleStart} disabled={isLoading || !betAmount}>Flip Coin</button>
          ) : (
            <>
              <button className="play-btn" onClick={handleRide} disabled={isLoading}>Let it Ride</button>
              <button className="play-btn" onClick={handleCashout} disabled={isLoading} style={{ marginLeft: 8 }}>Cash Out</button>
            </>
          )}
        </div>
        {message && <div style={{ color: 'red', marginBottom: 8 }}>{message}</div>}
        {result && (
          <div style={{ marginTop: 16, background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 16 }}>
            <div>Result: <b>{result.result}</b></div>
            <div>Win: <b>{result.win ? 'Yes' : 'No'}</b></div>
            <div>Amount: <b>${result.amount ? result.amount.toFixed(2) : 0}</b></div>
            <div>Flips: <b>{flips}</b></div>
            <div>Credits: <b>${result.credits ? result.credits.toFixed(2) : ''}</b></div>
            {result.payout && <div>Payout: <b>${result.payout.toFixed(2)}</b></div>}
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
};

export default Coinflip; 