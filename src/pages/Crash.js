import React, { useState, useRef } from 'react';
import Header from '../components/Header';
import Footer from '../components/Footer';
import '../pages/Home.css';
import axios from 'axios';
import { useAuthContext } from '../AuthContext';

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
  const [serverSeedHash, setServerSeedHash] = useState(null);
  const [seedId, setSeedId] = useState(null);
  const [clientSeed, setClientSeed] = useState('');
  const [verificationData, setVerificationData] = useState(null);
  const intervalRef = useRef(null);
  const { refreshUser } = useAuthContext();

  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  // Generate a random client seed
  const generateClientSeed = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 16; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  // Get server seed hash for pre-commitment
  const getServerSeed = async () => {
    try {
      const res = await axios.post(
        `${API_BASE_URL}/crash/get-server-seed`,
        {},
        { headers }
      );
      setServerSeedHash(res.data.seed_hash);
      setSeedId(res.data.seed_id);
      setClientSeed(generateClientSeed());
      return res.data;
    } catch (err) {
      setMessage('Error getting server seed: ' + (err.response?.data?.detail || 'Unknown error'));
      throw err;
    }
  };

  const handleStart = async () => {
    setIsLoading(true);
    setMessage('');
    setResult(null);
    setCashedOut(false);
    setCrashMultiplier(null);
    setMultiplier(1.0);
    setGameActive(false);
    setVerificationData(null);

    try {
      // First get server seed if we don't have one
      if (!serverSeedHash || !seedId) {
        await getServerSeed();
      }

      // Start the game with provably fair system
      const res = await axios.post(
        `${API_BASE_URL}/crash/start`,
        { 
          bet_amount: parseFloat(betAmount),
          client_seed: clientSeed,
          seed_id: seedId
        },
        { headers }
      );

      setRoundId(res.data.id);
      setGameActive(true);
      setMultiplier(1.0);
      
      // Start animation (we don't know the crash point yet)
      animateMultiplier();
      
      // Get a new server seed for the next game
      await getServerSeed();
      
    } catch (err) {
      setMessage(err.response?.data?.detail || 'Error starting game');
    } finally {
      setIsLoading(false);
    }
  };

  const animateMultiplier = () => {
    let current = 1.0;
    const start = Date.now();
    intervalRef.current = setInterval(() => {
      const elapsed = (Date.now() - start) / 1000;
      current = 1.0 + 0.1 * elapsed;
      setMultiplier(current);
      
      // Continue animation until user cashes out or we detect crash
      // The actual crash point will be determined by the server
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
      
      // Store verification data
      setVerificationData({
        server_seed: res.data.server_seed,
        client_seed: res.data.client_seed,
        nonce: res.data.nonce,
        crashed_at: res.data.crashed_at
      });
      
      await refreshUser();
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
      
      // Store verification data
      setVerificationData({
        server_seed: res.data.server_seed,
        client_seed: res.data.client_seed,
        nonce: res.data.nonce,
        crashed_at: res.data.crashed_at
      });
      
      await refreshUser();
    } catch (err) {
      // ignore
    }
  };

  const verifyFairness = async () => {
    if (!roundId) return;
    try {
      const res = await axios.get(
        `${API_BASE_URL}/crash/verify/${roundId}`,
        { headers }
      );
      setVerificationData(res.data);
    } catch (err) {
      setMessage('Error verifying fairness: ' + (err.response?.data?.detail || 'Unknown error'));
    }
  };

  // Simulate crash after a random time (for demo purposes)
  // In production, this would be determined by the server
  React.useEffect(() => {
    if (gameActive && !cashedOut) {
      const crashTimeout = setTimeout(() => {
        if (gameActive) {
          clearInterval(intervalRef.current);
          setGameActive(false);
          handleCrash();
        }
      }, Math.random() * 10000 + 2000); // Random crash between 2-12 seconds

      return () => clearTimeout(crashTimeout);
    }
  }, [gameActive, cashedOut]);

  return (
    <div className="main-bg">
      <Header />
      <div style={{ margin: '2rem auto', maxWidth: 500, background: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: 32 }}>
        <h1 style={{ textAlign: 'center' }}>Crash</h1>
        
        {/* Provably Fair Info */}
        <div style={{ marginBottom: 16, padding: 12, background: 'rgba(0,255,0,0.1)', borderRadius: 8, fontSize: 14 }}>
          <div><strong>🔒 Provably Fair System</strong></div>
          {serverSeedHash && (
            <div>Server Seed Hash: <code style={{ fontSize: 12 }}>{serverSeedHash.substring(0, 16)}...</code></div>
          )}
          {clientSeed && (
            <div>Client Seed: <code style={{ fontSize: 12 }}>{clientSeed}</code></div>
          )}
        </div>

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
            <div style={{ fontSize: 32, fontWeight: 'bold', color: '#ffd700' }}>
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
            
            {/* Verification Button */}
            <button 
              onClick={verifyFairness}
              style={{ 
                marginTop: 8, 
                padding: '8px 16px', 
                background: '#4CAF50', 
                color: 'white', 
                border: 'none', 
                borderRadius: 4,
                cursor: 'pointer'
              }}
            >
              Verify Fairness
            </button>
          </div>
        )}
        
        {/* Verification Data Display */}
        {verificationData && (
          <div style={{ marginTop: 16, background: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: 16, fontSize: 12 }}>
            <div><strong>🔍 Fairness Verification</strong></div>
            <div>Server Seed: <code>{verificationData.server_seed}</code></div>
            <div>Client Seed: <code>{verificationData.client_seed}</code></div>
            <div>Nonce: <code>{verificationData.nonce}</code></div>
            <div>Crash Point: <code>{verificationData.crashed_at}</code></div>
            <div>Verification String: <code>{verificationData.verification_string || `${verificationData.server_seed}:${verificationData.client_seed}:${verificationData.nonce}`}</code></div>
            {verificationData.is_fair !== undefined && (
              <div style={{ color: verificationData.is_fair ? '#4CAF50' : '#f44336' }}>
                Fairness: <strong>{verificationData.is_fair ? '✅ VERIFIED' : '❌ FAILED'}</strong>
              </div>
            )}
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
};

export default Crash;