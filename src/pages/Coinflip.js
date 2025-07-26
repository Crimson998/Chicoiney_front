import React, { useState } from 'react';
import Header from '../components/Header';
import Footer from '../components/Footer';
import '../pages/Home.css';
import axios from 'axios';
import { useAuthContext } from '../AuthContext';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://web-production-fc04.up.railway.app';

const Coinflip = () => {
  const [betAmount, setBetAmount] = useState('');
  const [guess, setGuess] = useState('heads');
  const [result, setResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [token] = useState(localStorage.getItem('token'));
  const [serverSeedHash, setServerSeedHash] = useState(null);
  const [seedId, setSeedId] = useState(null);
  const [clientSeed, setClientSeed] = useState('');
  const [verificationData, setVerificationData] = useState(null);
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
        `${API_BASE_URL}/coinflip/get-server-seed`,
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
    setVerificationData(null);

    try {
      // First get server seed if we don't have one
      if (!serverSeedHash || !seedId) {
        await getServerSeed();
      }

      // Play the coinflip with provably fair system
      const res = await axios.post(
        `${API_BASE_URL}/coinflip/play`,
        { 
          bet_amount: parseFloat(betAmount), 
          guess,
          client_seed: clientSeed,
          seed_id: seedId
        },
        { headers }
      );
      
      setResult(res.data);
      
      // Store verification data
      setVerificationData({
        server_seed: res.data.server_seed,
        client_seed: res.data.client_seed,
        nonce: res.data.nonce,
        result: res.data.result
      });
      
      // Get a new server seed for the next game
      await getServerSeed();
      
      await refreshUser();
    } catch (err) {
      setMessage(err.response?.data?.detail || 'Error starting game');
    } finally {
      setIsLoading(false);
    }
  };

  const verifyFairness = async () => {
    if (!result || !result.id) return;
    try {
      const res = await axios.get(
        `${API_BASE_URL}/coinflip/verify/${result.id}`,
        { headers }
      );
      setVerificationData(res.data);
    } catch (err) {
      setMessage('Error verifying fairness: ' + (err.response?.data?.detail || 'Unknown error'));
    }
  };

  return (
    <div className="main-bg">
      <Header />
      <div style={{ margin: '2rem auto', maxWidth: 500, background: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: 32 }}>
        <h1 style={{ textAlign: 'center' }}>Coinflip</h1>
        
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
            disabled={isLoading}
            style={{ width: 100, marginRight: 16 }}
          />
          <select value={guess} onChange={e => setGuess(e.target.value)} disabled={isLoading}>
            <option value="heads">Heads</option>
            <option value="tails">Tails</option>
          </select>
        </div>
        <div style={{ marginBottom: 16 }}>
          <button className="play-btn" onClick={handleStart} disabled={isLoading || !betAmount}>Flip Coin</button>
        </div>
        {message && <div style={{ color: 'red', marginBottom: 8 }}>{message}</div>}
        {result && (
          <div style={{ marginTop: 16, background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 16 }}>
            <div>Result: <b>{result.result}</b></div>
            <div>Win: <b>{result.win ? 'Yes' : 'No'}</b></div>
            <div>Amount: <b>${result.amount ? result.amount.toFixed(2) : 0}</b></div>
            <div>Credits: <b>${result.credits ? result.credits.toFixed(2) : ''}</b></div>
            
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
            <div>Result: <code>{verificationData.result || verificationData.actual_result}</code></div>
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

export default Coinflip; 