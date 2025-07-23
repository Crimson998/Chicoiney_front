// Force redeploy: update for backend API URL
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import axios from 'axios';
import './App.css';

// Use environment variable for API base URL, fallback to localhost for dev
const API_BASE_URL = 'https://web-production-fc04.up.railway.app';

// Custom hooks
const useAuth = () => {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [user, setUser] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // eslint-disable-next-line no-unused-vars
  const checkAuth = useCallback(async () => {
    if (!token) return [];
    
    try {
      const [userResponse, historyResponse] = await Promise.all([
        axios.get(`${API_BASE_URL}/user`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`${API_BASE_URL}/crash/rounds`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);
      
      setUser(userResponse.data);
      setIsLoggedIn(true);
      return historyResponse.data;
    } catch (error) {
      console.error('Auth check failed:', error);
      logout();
      return [];
    }
  }, [token]);

  const login = async (username, password) => {
    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append('username', username);
      formData.append('password', password);
      
      const response = await axios.post(`${API_BASE_URL}/auth/login`, formData);
      const { access_token } = response.data;
      
      setToken(access_token);
      localStorage.setItem('token', access_token);
      setIsLoggedIn(true);
      await checkAuth();
      return true;
    } catch (error) {
      throw new Error(error.response?.data?.detail || 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (username, password) => {
    setIsLoading(true);
    try {
      await axios.post(`${API_BASE_URL}/auth/register`, { username, password });
      return true;
    } catch (error) {
      throw new Error(error.response?.data?.detail || 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setIsLoggedIn(false);
    setUser(null);
  };

  // Refresh user data
  const refreshUser = useCallback(async () => {
    if (!token) return;
    
    try {
      const response = await axios.get(`${API_BASE_URL}/user`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUser(response.data);
    } catch (error) {
      console.error('Failed to refresh user:', error);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      checkAuth();
    }
  }, [token, checkAuth]);

  return { token, user, isLoggedIn, isLoading, login, register, logout, refreshUser };
};

const useGame = (token, user, audioRef, refreshUser) => {
  // eslint-disable-next-line no-unused-vars
  const [currentRound, setCurrentRound] = useState(null);
  const [multiplier, setMultiplier] = useState(1.00);
  const [gameActive, setGameActive] = useState(false);
  const [gameEnded, setGameEnded] = useState(false);
  const [gameResult, setGameResult] = useState(null); // 'win', 'crash', or null
  const [gameHistory, setGameHistory] = useState([]);
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [crashMultiplier, setCrashMultiplier] = useState(null);
  const [autoCashoutValue, setAutoCashoutValue] = useState(2.0);
  const [autoCashoutEnabled, setAutoCashoutEnabled] = useState(false);
  const [autoPlay, setAutoPlay] = useState(false);
  const [autoPlayGames, setAutoPlayGames] = useState(5);
  const [autoPlayDelay, setAutoPlayDelay] = useState(2);
  const [autoPlayCompleted, setAutoPlayCompleted] = useState(0);
  const [autoPlayTotal, setAutoPlayTotal] = useState(0);
  const [autoPlayBetAmount, setAutoPlayBetAmount] = useState(10);
  
  // Chart data for interactive visualization
  const [chartData, setChartData] = useState([]);
  const [chartPoints, setChartPoints] = useState([]);
  const [chartStartTime, setChartStartTime] = useState(null);
  const [chartAnimation, setChartAnimation] = useState(false);
  const [gameProcessingComplete, setGameProcessingComplete] = useState(true);
  
  const intervalRef = useRef(null);
  const autoPlayTimeoutRef = useRef(null);

  // Sound effects
  const playSound = useCallback((type) => {
    if (audioRef.current) {
      // Different sounds for different events like Stake
      switch(type) {
        case 'win':
          audioRef.current.src = '/win.mp3';
          break;
        case 'crash':
          audioRef.current.src = '/crash.mp3';
          break;
        case 'tick':
          audioRef.current.src = '/tick.mp3';
          break;
        case 'start':
          audioRef.current.src = '/start.mp3';
          break;
        default:
          audioRef.current.src = '/tick.mp3';
      }
      audioRef.current.volume = 0.3; // Lower volume like Stake
      audioRef.current.play().catch(() => {}); // Ignore audio errors
    }
  }, [audioRef]);

  const startGame = useCallback(async (betAmount) => {
    if (!token || !user) throw new Error('Not authenticated');
    
    setIsLoading(true);
    try {
      const response = await axios.post(
        `${API_BASE_URL}/crash/start`,
        { bet_amount: parseFloat(betAmount) },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setCurrentRound(response.data);
      setMultiplier(1.00);
      setGameActive(true);
      setGameEnded(false);
      setGameResult(null);
      setCrashMultiplier(response.data.crash_multiplier); // Store the crash multiplier from backend
      setGameProcessingComplete(false); // Game processing not complete until game ends
      
      // Reset chart for new game
      setChartData([]);
      setChartPoints([]);
      setChartStartTime(null);
      setChartAnimation(false);
      
      playSound('start');
      
      return response.data;
    } catch (error) {
      console.error('Game start error:', error);
      throw new Error(error.response?.data?.detail || 'Failed to start game');
    } finally {
      setIsLoading(false);
    }
  }, [token, user, playSound]);

  const cashOut = useCallback(async () => {
    if (!currentRound || !gameActive || !token || gameEnded) {
      throw new Error('Cannot cash out - game not active');
    }
    
    // Validate multiplier
    if (multiplier < 1.0) {
      throw new Error('Invalid multiplier for cash out');
    }
    
    setIsLoading(true);
    try {
      const response = await axios.post(
        `${API_BASE_URL}/crash/cashout`,
        { round_id: currentRound.id, cash_out_multiplier: multiplier },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setGameEnded(true);
      setGameActive(false);
      setGameResult('win');
      setCurrentRound(null);
      setMultiplier(1.00);
      setCrashMultiplier(null); // No crash multiplier when cashing out
      
      // Stop chart animation
      setChartAnimation(false);
      
      playSound('win');
      setGameHistory(prev => [response.data, ...prev]);
      setGameProcessingComplete(true); // Game processing is now complete
      return response.data;
    } catch (error) {
      if (error.response?.data?.detail === 'Game has already crashed') {
        // Handle crash manually without calling handleGameCrash
        setGameEnded(true);
        setGameResult('crash');
        setGameActive(false);
        setCurrentRound(null);
        setMultiplier(1.00);
        setCrashMultiplier(multiplier);
        setChartAnimation(false);
        playSound('crash');
        setGameProcessingComplete(true); // Game processing is now complete
        throw new Error('Game has already crashed!');
      }
      throw new Error(error.response?.data?.detail || 'Cash out failed');
    } finally {
      setIsLoading(false);
    }
  }, [currentRound, gameActive, token, gameEnded, multiplier, playSound]);

  const handleGameCrash = useCallback(async () => {
    if (!currentRound || !token || gameEnded) return;
    
    try {
      // Use the crash multiplier from backend
      const finalMultiplier = crashMultiplier || multiplier;
      
      setGameEnded(true);
      setGameResult('crash');
      setGameActive(false);
      setCurrentRound(null);
      setMultiplier(1.00);
      
      // Stop chart animation
      setChartAnimation(false);
      
      playSound('crash');
      
      // Get final game result to verify the crash point
      const response = await axios.get(
        `${API_BASE_URL}/crash/round/${currentRound.id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      // Verify the crash point matches what we calculated
      if (response.data.crashed_at) {
        const difference = Math.abs(response.data.crashed_at - finalMultiplier);
        if (difference > 0.1) {
          console.warn('Crash point mismatch:', finalMultiplier, 'vs', response.data.crashed_at, 'diff:', difference);
        } else {
          console.log('Crash point verified:', finalMultiplier, 'matches backend:', response.data.crashed_at);
        }
      }
      
      setGameHistory(prev => [response.data, ...prev]);
      setGameProcessingComplete(true); // Game processing is now complete
    } catch (error) {
      console.error('Failed to get crash result:', error);
      setGameProcessingComplete(true); // Even if error, mark as complete
    }
  }, [currentRound, token, gameEnded, multiplier, crashMultiplier, playSound]);

  const startAutoPlay = useCallback(async (betAmount, onError) => {
    if (!token || !user) return;
    
    // Validate bet amount
    if (betAmount > user.credits) {
      throw new Error('Insufficient credits for auto play');
    }
    
    // Reset auto play state
    setAutoPlay(true);
    setAutoPlayCompleted(0);
    setAutoPlayTotal(autoPlayGames);
    setAutoPlayBetAmount(betAmount);
    
    // Start first game after a small delay to prevent race conditions
    setTimeout(async () => {
      try {
        await startGame(betAmount);
      } catch (error) {
        console.error('Auto play failed to start:', error);
        setAutoPlay(false);
        // Call error callback if provided
        if (onError) {
          onError(error);
        }
      }
    }, 100); // Small delay to ensure state is properly set
  }, [token, user, autoPlayGames, startGame]);

  const stopAutoPlay = useCallback(() => {
    setAutoPlay(false);
    setAutoPlayCompleted(0);
    setAutoPlayTotal(0);
    setAutoPlayBetAmount(10);
    
    // Clear any pending auto play timeout
    if (autoPlayTimeoutRef.current) {
      clearTimeout(autoPlayTimeoutRef.current);
      autoPlayTimeoutRef.current = null;
    }
  }, []);

  // Auto play state machine - handles the flow of auto play games
  useEffect(() => {
    // Only run auto play logic when auto play is active and game has ended
    if (!autoPlay || !gameEnded || gameActive) {
      return;
    }

    // Check if we've completed all games
    if (autoPlayCompleted >= autoPlayTotal) {
      stopAutoPlay();
      return;
    }

    // Schedule next game after delay
    const scheduleNextGame = () => {
      autoPlayTimeoutRef.current = setTimeout(async () => {
        // Double-check auto play is still active
        if (!autoPlay) {
          return;
        }

        try {
          // Start next game
          await startGame(autoPlayBetAmount);
          setAutoPlayCompleted(prev => prev + 1);
        } catch (error) {
          console.error('Auto play game failed:', error);
          // Continue with next game even if this one failed
          setAutoPlayCompleted(prev => prev + 1);
        }
      }, autoPlayDelay * 1000);
    };

    scheduleNextGame();

    // Cleanup function
    return () => {
      if (autoPlayTimeoutRef.current) {
        clearTimeout(autoPlayTimeoutRef.current);
        autoPlayTimeoutRef.current = null;
      }
    };
  }, [autoPlay, gameEnded, gameActive, autoPlayCompleted, autoPlayTotal, autoPlayDelay, autoPlayBetAmount, startGame, stopAutoPlay]);

  const loadGameHistory = useCallback(async () => {
    if (!token) return;
    
    try {
      setIsRefreshing(true);
      const response = await axios.get(
        `${API_BASE_URL}/crash/rounds`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setGameHistory(response.data);
    } catch (error) {
      console.error('Failed to load game history:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [token]);

  const loadStats = useCallback(async () => {
    if (!token) return;
    
    try {
      setIsRefreshing(true);
      const response = await axios.get(
        `${API_BASE_URL}/crash/stats`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setStats(response.data);
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [token]);

  // Manual refresh function for immediate updates
  const refreshAllData = useCallback(async () => {
    if (!token) return;
    
    try {
      setIsRefreshing(true);
      await Promise.all([
        refreshUser(),
        loadStats(),
        loadGameHistory()
      ]);
    } catch (error) {
      console.error('Failed to refresh all data:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [token, refreshUser, loadStats, loadGameHistory]);

  // Game loop with backend-controlled crash timing and auto cashout
  useEffect(() => {
    if (gameActive && currentRound && !gameEnded && crashMultiplier) {
      // Use UTC time to match backend
      const gameStartTime = new Date(currentRound.created_at + 'Z').getTime();
      setChartStartTime(gameStartTime);
      
      // Only reset chart data if it's empty (new game)
      setChartData(prev => {
        if (prev.length === 0) {
          console.log('Initializing new chart data');
          return [];
        }
        return prev;
      });
      setChartPoints(prev => {
        if (prev.length === 0) {
          return [];
        }
        return prev;
      });
      setChartAnimation(true);
      
      intervalRef.current = setInterval(() => {
        try {
          const currentTime = Date.now();
          // Use UTC time to match backend
          const gameStartTimeUTC = new Date(currentRound.created_at + 'Z').getTime();
          const elapsedSeconds = (currentTime - gameStartTimeUTC) / 1000;
          
          // Calculate current multiplier using linear growth: 1.0 + (0.1 * seconds)
          const newMultiplier = Math.max(1.0, 1.0 + (0.1 * elapsedSeconds));
          
          setMultiplier(newMultiplier);
        
        // Update chart data in real-time
        const newChartPoint = {
          x: elapsedSeconds,
          y: newMultiplier,
          time: currentTime
        };
        
        setChartPoints(prev => [...prev, newChartPoint]);
        setChartData(prev => {
          const newData = [...prev, newChartPoint];
          console.log('Chart data updated:', newData.length, 'points, latest:', newChartPoint);
          return newData;
        });
        
        // Play tick sound every 0.5x
        if (Math.floor(newMultiplier * 100) % 50 === 0) {
          playSound('tick');
        }
        
        // Check auto cashout
        if (autoCashoutEnabled && autoCashoutValue > 1.0 && newMultiplier >= autoCashoutValue) {
          clearInterval(intervalRef.current);
          // Auto cashout
          cashOut().catch(error => {
            console.error('Auto cashout failed:', error);
            // If auto cashout fails, handle as crash
            handleGameCrash();
          });
        }
        
        // Check if we've reached the crash multiplier
        if (crashMultiplier && newMultiplier >= crashMultiplier) {
          clearInterval(intervalRef.current);
          handleGameCrash();
        }
              } catch (error) {
          console.error('Error in game loop:', error);
          // If there's an error, stop the game
          clearInterval(intervalRef.current);
          handleGameCrash();
        }
      }, 50); // Update every 50ms for smooth animation
      
      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
      };
    }
  }, [gameActive, currentRound, gameEnded, crashMultiplier, autoCashoutEnabled, autoCashoutValue, cashOut, handleGameCrash, playSound]);

  // Refresh after game processing is complete
  useEffect(() => {
    if (gameEnded && gameProcessingComplete) {
      // Only refresh when game has ended AND processing is complete
      const refreshAfterGame = async () => {
        setIsRefreshing(true);
        try {
          await Promise.all([
            refreshUser(),
            loadStats(),
            loadGameHistory()
          ]);
        } catch (error) {
          console.error('Failed to refresh after game:', error);
        } finally {
          setIsRefreshing(false);
        }
      };
      refreshAfterGame();
    }
  }, [gameEnded, gameProcessingComplete, refreshUser, loadStats, loadGameHistory]);

  // Refresh when user changes
  useEffect(() => {
    if (user) {
      const refreshOnUserChange = async () => {
        setIsRefreshing(true);
        try {
          await Promise.all([
            loadStats(),
            loadGameHistory()
          ]);
        } catch (error) {
          console.error('Failed to refresh on user change:', error);
        } finally {
          setIsRefreshing(false);
        }
      };
      refreshOnUserChange();
    }
  }, [user, loadStats, loadGameHistory]);

  return {
    currentRound,
    multiplier,
    gameActive,
    gameEnded,
    gameResult,
    gameHistory,
    stats,
    isLoading,
    isRefreshing,
    startGame,
    cashOut,
    loadGameHistory,
    loadStats,
    refreshAllData,
    autoCashoutValue,
    setAutoCashoutValue,
    autoCashoutEnabled,
    setAutoCashoutEnabled,
    autoPlay,
    autoPlayGames,
    setAutoPlayGames,
    autoPlayDelay,
    setAutoPlayDelay,
    autoPlayCompleted,
    autoPlayTotal,
    startAutoPlay,
    stopAutoPlay,
    // Chart data
    chartData,
    chartPoints,
    chartStartTime,
    chartAnimation,
    crashMultiplier,
    gameProcessingComplete
  };
};

// Enhanced Components
const AuthForm = ({ onLogin, onRegister, isLoading }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    try {
      if (isLogin) {
        await onLogin(formData.username, formData.password);
      } else {
        await onRegister(formData.username, formData.password);
        setIsLogin(true);
        setFormData({ username: '', password: '' });
      }
    } catch (error) {
      setError(error.message);
    }
  };

  const validateForm = () => {
    return formData.username.length >= 3 && formData.password.length >= 6;
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1 className="auth-title">🎰 Crash Game</h1>
        <p className="auth-subtitle">Experience the thrill of the crash!</p>
        
        <div className="auth-tabs">
          <button 
            className={`auth-tab ${isLogin ? 'active' : ''}`}
            onClick={() => setIsLogin(true)}
          >
            Login
          </button>
          <button 
            className={`auth-tab ${!isLogin ? 'active' : ''}`}
            onClick={() => setIsLogin(false)}
          >
            Register
          </button>
        </div>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <input
              type="text"
              placeholder="Username (min 3 characters)"
              value={formData.username}
              onChange={(e) => setFormData({...formData, username: e.target.value})}
              required
              disabled={isLoading}
              minLength={3}
            />
          </div>
          <div className="form-group password-group">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Password (min 6 characters)"
              value={formData.password}
              onChange={(e) => setFormData({...formData, password: e.target.value})}
              required
              disabled={isLoading}
              minLength={6}
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword(!showPassword)}
              disabled={isLoading}
            >
              {showPassword ? '👁️' : '👁️‍🗨️'}
            </button>
          </div>
          <button 
            type="submit" 
            className="auth-button" 
            disabled={isLoading || !validateForm()}
          >
            {isLoading ? (
              <span className="loading-spinner">⏳</span>
            ) : (
              isLogin ? 'Login' : 'Register'
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

const GameHeader = ({ user, onLogout, onRefresh, isRefreshing, compactMode, onToggleCompactMode }) => {
  return (
    <header className="game-header">
      <div className="header-content">
        <div className="user-info">
          <h2>Welcome, {user?.username || 'Player'}!</h2>
          <div className="credits-display">
            <span className="credits-label">Credits:</span>
            <span className="credits-amount">${user?.credits?.toFixed(2) || '0.00'}</span>
            {isRefreshing && <span className="refresh-indicator">🔄</span>}
          </div>
        </div>
        <div className="header-actions">
          <button 
            className={`compact-toggle-btn ${compactMode ? 'active' : ''}`}
            onClick={onToggleCompactMode}
            title={compactMode ? 'Switch to Normal Mode' : 'Switch to Compact Mode'}
          >
            {compactMode ? '📱' : '🖥️'} {compactMode ? 'Normal' : 'Compact'}
          </button>
          <button 
            className="refresh-btn" 
            onClick={onRefresh}
            disabled={isRefreshing}
            title="Refresh data"
          >
            {isRefreshing ? '🔄' : '🔄'} Refresh
          </button>
          <button className="logout-btn" onClick={onLogout}>
            Logout
          </button>
        </div>
      </div>
      </header>
  );
};

const GameDisplay = ({ 
  multiplier, 
  gameActive, 
  gameEnded, 
  gameResult, 
  betAmount, 
  autoCashoutEnabled, 
  autoCashoutValue,
  onStartGame,
  onCashOut,
  user,
  isLoading,
  autoPlay,
  autoPlayGames,
  autoPlayCompleted,
  autoPlayTotal,
  onStartAutoPlay,
  onStopAutoPlay,
  onBetChange
}) => {
  const getDisplayState = () => {
    if (gameEnded) {
      if (gameResult === 'win') {
        return { text: 'CASHED OUT!', className: 'cashed-out' };
      } else if (gameResult === 'crash') {
        return { text: 'CRASHED!', className: 'crashed' };
      }
    }
    if (gameActive) {
      return { text: 'CRASHING!', className: 'active' };
    }
    return { text: 'READY', className: 'idle' };
  };

  const displayState = getDisplayState();
  const multiplierColor = useMemo(() => {
    if (multiplier >= 10) return '#ff6b35';
    if (multiplier >= 5) return '#ffd700';
    if (multiplier >= 2) return '#4CAF50';
    return '#ffffff';
  }, [multiplier]);

  // Format multiplier like Stake (more decimal places for higher values)
  const formatMultiplier = (mult) => {
    if (!mult || isNaN(mult) || mult < 1) return '1.0000';
    if (mult >= 100) return mult.toFixed(1);
    if (mult >= 10) return mult.toFixed(2);
    if (mult >= 2) return mult.toFixed(3);
    return mult.toFixed(4);
  };

  // Calculate potential winnings
  const potentialWinnings = useMemo(() => {
    if (!betAmount || !gameActive) return 0;
    
    // Ensure betAmount is a number and handle edge cases
    const bet = typeof betAmount === 'number' ? betAmount : parseFloat(betAmount) || 0;
    const mult = typeof multiplier === 'number' ? Math.max(1.0, multiplier) : Math.max(1.0, parseFloat(multiplier) || 1);
    
    if (bet <= 0 || mult < 1) return 0;
    
    const winnings = bet * mult;
    return winnings.toFixed(2);
  }, [betAmount, multiplier, gameActive]);

  return (
    <div className="game-display">
      <div className={`multiplier-container ${displayState.className}`}>
        <div className="multiplier-row">
          <div 
            className="multiplier-value" 
            style={{ color: multiplierColor }}
          >
            {formatMultiplier(multiplier)}x
          </div>
          {gameActive && betAmount && (
            <div className="potential-winnings">
              ${potentialWinnings}
            </div>
          )}
        </div>
        
        {/* Prominent Bet Amount Display */}
        <div className="bet-amount-display">
          <div className="bet-amount-label">Current Bet:</div>
          <div className="bet-amount-value">${betAmount}</div>
          <div className="bet-amount-controls">
            <button 
              className="bet-adjust-btn"
              onClick={() => onBetChange(Math.max(0.01, betAmount - 1))}
              disabled={gameActive || isLoading || autoPlay}
            >
              -
            </button>
            <button 
              className="bet-adjust-btn"
              onClick={() => onBetChange(betAmount + 1)}
              disabled={gameActive || isLoading || autoPlay || betAmount >= (user?.credits || 0)}
            >
              +
            </button>
          </div>
        </div>
        <div className="multiplier-label">
          {displayState.text}
        </div>
        {gameActive && (
          <div className="multiplier-progress">
            <div 
              className="progress-bar" 
              style={{ width: `${Math.min((multiplier - 1) * 10, 100)}%` }}
            />
          </div>
        )}
        {/* Status Indicators */}
        <div className="status-indicators">
          {gameActive && autoCashoutEnabled && autoCashoutValue > 1.0 && (
            <div className="status-indicator auto-cashout-status">
              <span className="status-icon">🎯</span>
              Auto cashout at {autoCashoutValue}x
            </div>
          )}
          {autoPlay && (
            <div className="status-indicator auto-play-status">
              <span className="status-icon">🎮</span>
              Auto play: {autoPlayCompleted}/{autoPlayTotal}
            </div>
          )}
          {gameActive && (
            <div className="status-indicator game-active-status">
              <span className="status-icon">⚡</span>
              Game Active
            </div>
          )}
        </div>
      </div>
      
      {/* Action Buttons at the top */}
      <div className="game-action">
        {!gameActive ? (
          <div className="action-buttons">
            <button 
              onClick={onStartGame} 
              className="start-button"
              disabled={!betAmount || betAmount > (user?.credits || 0) || isLoading || autoPlay}
            >
              {isLoading ? (
                <span className="loading-spinner">⏳</span>
              ) : (
                'Start Game'
              )}
            </button>
            
            {!autoPlay && (
              <button 
                onClick={onStartAutoPlay}
                className="auto-play-button"
                disabled={!betAmount || betAmount > (user?.credits || 0) || isLoading}
              >
                🎮 Auto Play ({autoPlayGames} games)
              </button>
            )}
            
            {autoPlay && (
              <button 
                onClick={onStopAutoPlay}
                className="stop-auto-play-button"
                disabled={isLoading}
              >
                ⏹️ Stop Auto Play ({autoPlayCompleted}/{autoPlayTotal})
              </button>
            )}
          </div>
        ) : (
          <button 
            onClick={onCashOut} 
            className="cashout-button"
            disabled={isLoading}
          >
            {isLoading ? (
              <span className="loading-spinner">⏳</span>
            ) : (
              'Cash Out Now!'
            )}
          </button>
        )}
      </div>
    </div>
  );
};

const GameControls = ({ 
  betAmount, 
  onBetChange, 
  gameActive, 
  user, 
  isLoading,
  autoCashoutValue,
  setAutoCashoutValue,
  autoCashoutEnabled,
  setAutoCashoutEnabled,
  autoPlay,
  autoPlayGames,
  setAutoPlayGames,
  autoPlayDelay,
  setAutoPlayDelay,
  autoPlayCompleted,
  autoPlayTotal
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const quickBetAmounts = useMemo(() => {
    const maxCredit = user?.credits || 1000;
    return [0.01, 0.10, 1.00, 10.00, 100.00].filter(amount => amount <= maxCredit);
  }, [user?.credits]);

  const handleQuickBet = (amount) => {
    onBetChange(amount);
  };

  const handleBetChange = (value) => {
    const numValue = parseFloat(value) || 0;
    const maxBet = Math.min(user?.credits || 1000, 1000);
    onBetChange(Math.min(numValue, maxBet));
  };

  return (
    <div className="game-controls">
      <div className="bet-controls">
        <div className="bet-input-group">
          <label className="bet-label">Bet Amount:</label>
          <input
            type="number"
            value={betAmount}
            onChange={(e) => handleBetChange(e.target.value)}
            min="1"
            max={user?.credits || 1000}
            disabled={gameActive || isLoading || autoPlay}
            className="bet-input"
            step="0.01"
          />
        </div>
        
        <div className="quick-bet-buttons">
          {quickBetAmounts.map(amount => (
            <button
              key={amount}
              onClick={() => handleQuickBet(amount)}
              disabled={gameActive || isLoading || autoPlay || amount > (user?.credits || 0)}
              className="quick-bet-button"
            >
              ${amount}
            </button>
          ))}
        </div>

        <div className="advanced-controls">
          <button 
            className="advanced-toggle"
            onClick={() => setShowAdvanced(!showAdvanced)}
            disabled={gameActive}
          >
            {showAdvanced ? '▼' : '▶'} Advanced
          </button>
          
          {showAdvanced && (
            <div className="advanced-panel">
              <div className="auto-cashout-group">
                <div className="auto-cashout-header">
                  <label>Auto Cashout:</label>
                  <div className="toggle-switch">
                    <input
                      type="checkbox"
                      id="auto-cashout-toggle"
                      checked={autoCashoutEnabled}
                      onChange={(e) => setAutoCashoutEnabled(e.target.checked)}
                      disabled={gameActive || autoPlay}
                    />
                    <label htmlFor="auto-cashout-toggle" className="toggle-slider"></label>
                  </div>
                </div>
                
                {autoCashoutEnabled && (
                  <div className="auto-cashout-input-group">
                    <span>at:</span>
                    <input
                      type="number"
                      value={autoCashoutValue}
                      onChange={(e) => setAutoCashoutValue(parseFloat(e.target.value) || 1.0)}
                      min="1.0"
                      max="100.0"
                      step="0.1"
                      disabled={gameActive || autoPlay}
                      className="auto-cashout-input"
                    />
                    <span>x</span>
                  </div>
                )}
                
                {gameActive && autoCashoutEnabled && autoCashoutValue > 1.0 && (
                  <div className="auto-cashout-status">
                    Auto cashout set at {autoCashoutValue}x
                  </div>
                )}
              </div>

              <div className="auto-play-group">
                <label>Auto Play:</label>
                <div className="auto-play-settings">
                  <div className="auto-play-input-group">
                    <span>Games:</span>
                    <input
                      type="number"
                      value={autoPlayGames}
                      onChange={(e) => setAutoPlayGames(Math.max(1, parseInt(e.target.value) || 1))}
                      min="1"
                      max="50"
                      disabled={gameActive || autoPlay}
                      className="auto-play-input"
                    />
                  </div>
                  <div className="auto-play-input-group">
                    <span>Delay:</span>
                    <input
                      type="number"
                      value={autoPlayDelay}
                      onChange={(e) => setAutoPlayDelay(Math.max(1, parseInt(e.target.value) || 1))}
                      min="1"
                      max="10"
                      disabled={gameActive || autoPlay}
                      className="auto-play-input"
                    />
                    <span>sec</span>
                  </div>
                </div>
                
                {autoPlay && (
                  <div className="auto-play-progress">
                    <div className="auto-play-status">
                      Auto playing: {autoPlayCompleted}/{autoPlayTotal} games
                    </div>
                    <div className="progress-bar-container">
                      <div 
                        className="auto-play-progress-bar" 
                        style={{ width: `${(autoPlayCompleted / autoPlayTotal) * 100}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const RecentCrashes = ({ recentCrashes }) => {
  const getCrashColor = (multiplier) => {
    if (!multiplier || multiplier < 1) return '#ff4444';
    if (multiplier >= 10) return '#ff6b35';
    if (multiplier >= 5) return '#ffd700';
    if (multiplier >= 2) return '#4CAF50';
    return '#ff4444';
  };

  if (!recentCrashes || recentCrashes.length === 0) {
    return (
      <div className="recent-crashes">
        <h3>Recent Crashes</h3>
        <div className="crashes-list">
          <div className="crash-item">No data</div>
        </div>
      </div>
    );
  }

  return (
    <div className="recent-crashes">
      <h3>Recent Crashes</h3>
      <div className="crashes-list">
        {recentCrashes.slice(0, 10).map((crash, index) => (
          <div 
            key={index} 
            className="crash-item"
            style={{ color: getCrashColor(crash.multiplier) }}
          >
            {crash.multiplier ? crash.multiplier.toFixed(2) : '1.00'}x
          </div>
        ))}
      </div>
    </div>
  );
};

const GameHistory = ({ gameHistory }) => {
  const [filter, setFilter] = useState('all'); // 'all', 'wins', 'losses'

  const filteredHistory = useMemo(() => {
    switch (filter) {
      case 'wins':
        return gameHistory.filter(round => round.cashed_out_at);
      case 'losses':
        return gameHistory.filter(round => !round.cashed_out_at);
      default:
        return gameHistory;
    }
  }, [gameHistory, filter]);

  const stats = useMemo(() => {
    const total = gameHistory.length;
    const wins = gameHistory.filter(round => round.cashed_out_at).length;
    const losses = total - wins;
    const winRate = total > 0 ? (wins / total * 100).toFixed(1) : 0;
    
    return { total, wins, losses, winRate };
  }, [gameHistory]);

  return (
    <div className="game-history">
      <div className="history-header">
        <h3 className="history-title">Recent Games</h3>
        <div className="history-filters">
          <button 
            className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All ({stats.total})
          </button>
          <button 
            className={`filter-btn ${filter === 'wins' ? 'active' : ''}`}
            onClick={() => setFilter('wins')}
          >
            Wins ({stats.wins})
          </button>
          <button 
            className={`filter-btn ${filter === 'losses' ? 'active' : ''}`}
            onClick={() => setFilter('losses')}
          >
            Losses ({stats.losses})
          </button>
        </div>
      </div>
      
      <div className="history-stats">
        <span>Win Rate: {stats.winRate}%</span>
      </div>
      
      <div className="history-list">
        {filteredHistory.slice(0, 10).map((round) => (
          <div key={round.id} className={`history-item ${round.cashed_out_at ? 'won' : 'lost'}`}>
            <div className="history-bet">${round.bet_amount}</div>
            {round.cashed_out_at ? (
              // Player cashed out - show cash out multiplier
              <div className="history-cashout">💰 {round.cashed_out_at}x</div>
            ) : (
              // Player didn't cash out - show crash multiplier or "Active"
              <div className="history-crash">
                {round.crashed_at ? `@${round.crashed_at}x` : 'Active'}
              </div>
            )}
          </div>
        ))}
        {filteredHistory.length === 0 && (
          <div className="no-history">No games found</div>
        )}
      </div>
    </div>
  );
};

const GameStats = ({ stats }) => {
  if (!stats) return null;
  
  const getProfitColor = (profit) => {
    if (profit > 0) return 'positive';
    if (profit < 0) return 'negative';
    return 'neutral';
  };

  return (
    <div className="game-stats">
      <h3 className="stats-title">Statistics</h3>
      <div className="stats-grid">
        <div className="stat-item">
          <div className="stat-label">Win Rate</div>
          <div className="stat-value">{stats.win_rate.toFixed(1)}%</div>
        </div>
        <div className="stat-item">
          <div className="stat-label">RTP</div>
          <div className="stat-value">{stats.rtp.toFixed(1)}%</div>
        </div>
        <div className="stat-item">
          <div className="stat-label">Total Profit</div>
          <div className={`stat-value ${getProfitColor(stats.profit)}`}>
            ${stats.profit.toFixed(2)}
          </div>
        </div>
        <div className="stat-item">
          <div className="stat-label">Highest Win</div>
          <div className="stat-value">${stats.highest_win.toFixed(2)}</div>
        </div>
        <div className="stat-item">
          <div className="stat-label">Total Rounds</div>
          <div className="stat-value">{stats.total_rounds}</div>
        </div>
        <div className="stat-item">
          <div className="stat-label">Avg Crash</div>
          <div className="stat-value">{stats.average_crash.toFixed(2)}x</div>
        </div>
      </div>
    </div>
  );
};

const CrashChart = ({ 
  chartData, 
  chartAnimation, 
  gameActive, 
  gameEnded, 
  crashMultiplier, 
  multiplier,
  betAmount,
  setAutoCashoutValue,
  autoCashoutEnabled
}) => {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const [hoverPoint, setHoverPoint] = useState(null);

  // Chart dimensions and styling
  const chartConfig = useMemo(() => ({
    width: 600,
    height: 400,
    padding: 40,
    gridColor: 'rgba(255, 255, 255, 0.1)',
    lineColor: '#ffd700',
    crashColor: '#ff6b6b',
    winColor: '#4ecdc4',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    textColor: '#ffffff',
    fontSize: 12
  }), []);

  const drawChart = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { width, height, padding } = chartConfig;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = chartConfig.backgroundColor;
    ctx.fillRect(0, 0, width, height);
    const chartWidth = width - 2 * padding;
    const chartHeight = height - 2 * padding;
    if (!chartData || chartData.length === 0) {
        ctx.fillStyle = chartConfig.textColor;
        ctx.font = `${chartConfig.fontSize + 4}px Arial`;
        ctx.textAlign = 'center';
      ctx.fillText(gameActive ? 'Generating chart data...' : 'Chart will appear when game starts', width / 2, height / 2);
      return;
    }
    // Calculate dynamic bounds
    const currentTime = Math.max(...chartData.map(d => d.x), 0);
    const currentMultiplier = Math.max(...chartData.map(d => d.y), 1);
    let maxX, maxY;
    if (gameActive) {
      maxX = Math.max(currentTime * 1.2, 5);
      maxY = Math.max(currentMultiplier * 1.3, 2);
    } else if (gameEnded && crashMultiplier) {
      maxX = Math.max(currentTime * 1.1, 3);
      maxY = Math.max(crashMultiplier * 1.2, currentMultiplier * 1.1, 2);
    } else {
      maxX = Math.max(currentTime, 10);
      maxY = Math.max(currentMultiplier, 2);
    }
    maxX = Math.max(maxX, 3);
    maxY = Math.max(maxY, 1.5);
    maxX = Math.min(maxX, 60);
    maxY = Math.min(maxY, 100);
    // Draw grid
    ctx.strokeStyle = chartConfig.gridColor;
    ctx.lineWidth = 1;
    for (let i = 0; i <= 10; i++) {
      const x = padding + (i / 10) * chartWidth;
      ctx.beginPath();
      ctx.moveTo(x, padding);
      ctx.lineTo(x, height - padding);
      ctx.stroke();
    }
    for (let i = 0; i <= 10; i++) {
      const y = height - padding - (i / 10) * chartHeight;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
      ctx.stroke();
    }
    ctx.fillStyle = chartConfig.textColor;
    ctx.font = `${chartConfig.fontSize}px Arial`;
    ctx.textAlign = 'center';
    for (let i = 0; i <= 10; i++) {
      const x = padding + (i / 10) * chartWidth;
      const time = (i / 10) * maxX;
      ctx.fillText(`${time.toFixed(1)}s`, x, height - padding + 20);
    }
    ctx.textAlign = 'right';
    for (let i = 0; i <= 10; i++) {
      const y = height - padding - (i / 10) * chartHeight;
      const mult = (i / 10) * maxY;
      ctx.fillText(`${mult.toFixed(1)}x`, padding - 10, y + 4);
    }
    if (crashMultiplier && gameEnded) {
      const crashY = height - padding - (crashMultiplier / maxY) * chartHeight;
      ctx.strokeStyle = chartConfig.crashColor;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(padding, crashY);
      ctx.lineTo(width - padding, crashY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = chartConfig.crashColor;
      ctx.font = `bold ${chartConfig.fontSize}px Arial`;
      ctx.textAlign = 'left';
      ctx.fillText(`CRASH: ${crashMultiplier.toFixed(2)}x`, width - padding + 10, crashY + 4);
    }
    if (chartData.length > 1) {
      ctx.strokeStyle = gameActive ? chartConfig.lineColor : gameEnded ? chartConfig.crashColor : chartConfig.winColor;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      chartData.forEach((point, index) => {
        const x = padding + (point.x / maxX) * chartWidth;
        const y = height - padding - (point.y / maxY) * chartHeight;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      if (gameActive && chartData.length > 0) {
        const lastPoint = chartData[chartData.length - 1];
        const x = padding + (lastPoint.x / maxX) * chartWidth;
        const y = height - padding - (lastPoint.y / maxY) * chartHeight;
        ctx.fillStyle = chartConfig.lineColor;
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, 2 * Math.PI);
        ctx.fill();
        ctx.fillStyle = chartConfig.textColor;
        ctx.font = `bold ${chartConfig.fontSize + 2}px Arial`;
        ctx.textAlign = 'center';
        ctx.fillText(`${lastPoint.y.toFixed(2)}x`, x, y - 15);
      }
    }
    if (hoverPoint) {
      const x = padding + (hoverPoint.x / maxX) * chartWidth;
      const y = height - padding - (hoverPoint.y / maxY) * chartHeight;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x, padding);
      ctx.lineTo(x, height - padding);
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = chartConfig.lineColor;
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, 2 * Math.PI);
      ctx.fill();
      const tooltipText = `${hoverPoint.y.toFixed(2)}x at ${hoverPoint.x.toFixed(1)}s`;
      const tooltipWidth = ctx.measureText(tooltipText).width + 20;
      const tooltipX = Math.min(x + 10, width - tooltipWidth - 10);
      const tooltipY = Math.max(y - 40, padding + 10);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.fillRect(tooltipX, tooltipY - 20, tooltipWidth, 25);
      ctx.fillStyle = chartConfig.textColor;
      ctx.font = `${chartConfig.fontSize}px Arial`;
      ctx.textAlign = 'left';
      ctx.fillText(tooltipText, tooltipX + 10, tooltipY - 5);
    }
  }, [chartData, gameActive, gameEnded, crashMultiplier, hoverPoint, chartConfig]);

  const handleMouseMove = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (chartData && chartData.length > 0) {
      const { width, height, padding } = chartConfig;
      const chartWidth = width - 2 * padding;
      const chartHeight = height - 2 * padding;
      const currentTime = Math.max(...chartData.map(d => d.x));
      const currentMultiplier = Math.max(...chartData.map(d => d.y));
      let maxX, maxY;
      if (gameActive) {
        maxX = Math.max(currentTime * 1.2, 5);
        maxY = Math.max(currentMultiplier * 1.3, 2);
      } else if (gameEnded && crashMultiplier) {
        maxX = Math.max(currentTime * 1.1, 3);
        maxY = Math.max(crashMultiplier * 1.2, currentMultiplier * 1.1, 2);
      } else {
        maxX = Math.max(currentTime, 10);
        maxY = Math.max(currentMultiplier, 2);
      }
      maxX = Math.max(maxX, 3);
      maxY = Math.max(maxY, 1.5);
      maxX = Math.min(maxX, 60);
      maxY = Math.min(maxY, 100);
      let closestPoint = null;
      let minDistance = Infinity;
      chartData.forEach(point => {
        const pointX = padding + (point.x / maxX) * chartWidth;
        const pointY = height - padding - (point.y / maxY) * chartHeight;
        const distance = Math.sqrt((x - pointX) ** 2 + (y - pointY) ** 2);
        if (distance < minDistance && distance < 20) {
          minDistance = distance;
          closestPoint = point;
        }
      });
      setHoverPoint(closestPoint);
    }
  }, [chartData, chartConfig, gameActive, gameEnded, crashMultiplier]);

  const handleMouseLeave = useCallback(() => {
    setHoverPoint(null);
  }, []);

  const handleChartClick = useCallback((e) => {
    if (!autoCashoutEnabled || gameActive) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const { height, padding } = chartConfig;
    const chartHeight = height - 2 * padding;
    const maxY = 10;
    const clickY = height - padding - y;
    const multiplier = (clickY / chartHeight) * maxY;
    const clampedMultiplier = Math.max(1.0, Math.min(10.0, multiplier));
    setAutoCashoutValue(parseFloat(clampedMultiplier.toFixed(2)));
  }, [autoCashoutEnabled, gameActive, chartConfig, setAutoCashoutValue]);

  useEffect(() => {
    if ((chartData && chartData.length > 0) || gameActive) {
      drawChart();
    }
  }, [drawChart, chartData, gameActive]);

  useEffect(() => {
    if (chartAnimation && gameActive) {
      const animate = () => {
        drawChart();
        animationRef.current = requestAnimationFrame(animate);
      };
      animate();
    }
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [chartAnimation, gameActive, drawChart]);

  return (
    <>
      <h3 className="chart-title">Live Crash Chart</h3>
      <div className="chart-wrapper">
        <canvas
          ref={canvasRef}
          width={chartConfig.width}
          height={chartConfig.height}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onClick={handleChartClick}
          className="crash-chart"
          style={{ cursor: autoCashoutEnabled && !gameActive ? 'crosshair' : 'default' }}
        />
      </div>
      <div className="chart-info">
        <div className="info-item">
          <span className="info-label">Current:</span>
          <span className="info-value">{multiplier.toFixed(2)}x</span>
        </div>
        {crashMultiplier && gameEnded && (
          <div className="info-item">
            <span className="info-label">Crash:</span>
            <span className="info-value crash">{crashMultiplier.toFixed(2)}x</span>
          </div>
        )}
        <div className="info-item">
          <span className="info-label">Bet:</span>
          <span className="info-value">${betAmount}</span>
        </div>
        <div className="info-item">
          <span className="info-label">Data Points:</span>
          <span className="info-value">{chartData ? chartData.length : 0}</span>
        </div>
        {chartData && chartData.length > 0 && (
          <>
            <div className="info-item">
              <span className="info-label">Scale:</span>
              <span className="info-value">
                {(() => {
                  const currentTime = Math.max(...chartData.map(d => d.x));
                  const currentMultiplier = Math.max(...chartData.map(d => d.y));
                  let maxX, maxY;
                  if (gameActive) {
                    maxX = Math.max(currentTime * 1.2, 5);
                    maxY = Math.max(currentMultiplier * 1.3, 2);
                  } else if (gameEnded && crashMultiplier) {
                    maxX = Math.max(currentTime * 1.1, 3);
                    maxY = Math.max(crashMultiplier * 1.2, currentMultiplier * 1.1, 2);
                  } else {
                    maxX = Math.max(currentTime, 10);
                    maxY = Math.max(currentMultiplier, 2);
                  }
                  maxX = Math.max(maxX, 3);
                  maxY = Math.max(maxY, 1.5);
                  maxX = Math.min(maxX, 60);
                  maxY = Math.min(maxY, 100);
                  return `${maxX.toFixed(1)}s × ${maxY.toFixed(1)}x`;
                })()}
              </span>
            </div>
          </>
        )}
      </div>
    </>
  );
};

// Main App Component
function App() {
  const [betAmount, setBetAmount] = useState(10);
  const [notification, setNotification] = useState(null);
  const [compactMode, setCompactMode] = useState(false);
  const audioRef = useRef(null);
  
  // Ensure betAmount is always a number
  const safeBetAmount = typeof betAmount === 'number' ? betAmount : parseFloat(betAmount) || 10;
  
  const { token, user, isLoggedIn, isLoading: authLoading, login, register, logout, refreshUser } = useAuth();
  const {
    multiplier,
    gameActive,
    gameEnded,
    gameResult,
    gameHistory,
    stats,
    isLoading: gameLoading,
    isRefreshing,
    startGame,
    cashOut,
    loadGameHistory,
    loadStats,
    refreshAllData,
    autoCashoutValue,
    setAutoCashoutValue,
    autoCashoutEnabled,
    setAutoCashoutEnabled,
    autoPlay,
    autoPlayGames,
    setAutoPlayGames,
    autoPlayDelay,
    setAutoPlayDelay,
    autoPlayCompleted,
    autoPlayTotal,
    startAutoPlay,
    stopAutoPlay,
    // Chart data
    chartData,
    chartAnimation,
    crashMultiplier,
    gameProcessingComplete
  } = useGame(token, user, audioRef, refreshUser);

  // Load data when authenticated
  useEffect(() => {
    if (isLoggedIn) {
      loadGameHistory();
      loadStats();
    }
  }, [isLoggedIn, loadGameHistory, loadStats]);

  const handleLogin = async (username, password) => {
    try {
      await login(username, password);
    } catch (error) {
      setNotification({ type: 'error', message: error.message });
    }
  };

  const handleRegister = async (username, password) => {
    try {
      await register(username, password);
      setNotification({ type: 'success', message: 'Registration successful! Please login.' });
    } catch (error) {
      setNotification({ type: 'error', message: error.message });
    }
  };

  const handleStartGame = async () => {
    try {
      await startGame(safeBetAmount);
      // Refresh user data immediately after starting game to update credits
      await refreshUser();
    } catch (error) {
      setNotification({ type: 'error', message: error.message });
    }
  };

  const handleCashOut = async () => {
    try {
      const result = await cashOut();
      const winAmount = result.bet_amount * result.cashed_out_at;
      setNotification({ 
        type: 'success', 
        message: `Cashed out at ${result.cashed_out_at}x! You won $${winAmount.toFixed(2)}!` 
      });
      
      // Refresh user data and stats immediately after cash out
      await Promise.all([
        refreshUser(),
        loadStats(),
        loadGameHistory()
      ]);
    } catch (error) {
      setNotification({ type: 'error', message: error.message });
    }
  };

  const handleStartAutoPlay = async () => {
    try {
      await startAutoPlay(safeBetAmount, (error) => {
        setNotification({ type: 'error', message: error.message });
      });
      setNotification({ 
        type: 'success', 
        message: `Auto play started! Playing ${autoPlayGames} games with ${autoPlayDelay}s delay.` 
      });
      // Refresh user data immediately after starting auto play
      await refreshUser();
    } catch (error) {
      setNotification({ type: 'error', message: error.message });
    }
  };

  const handleStopAutoPlay = () => {
    stopAutoPlay();
    setNotification({ 
      type: 'info', 
      message: `Auto play stopped. Completed ${autoPlayCompleted} games.` 
    });
  };

  // Auto-refresh data periodically (only when game processing is complete)
  useEffect(() => {
    if (!isLoggedIn || !gameProcessingComplete) return;

    const refreshInterval = setInterval(() => {
      refreshUser();
      loadStats();
      loadGameHistory();
    }, 10000); // Refresh every 10 seconds for more consistent updates

    return () => clearInterval(refreshInterval);
  }, [isLoggedIn, gameProcessingComplete, refreshUser, loadStats, loadGameHistory]);

  // Auto play status notifications
  useEffect(() => {
    if (autoPlay && autoPlayCompleted > 0 && autoPlayCompleted < autoPlayTotal) {
      setNotification({ 
        type: 'info', 
        message: `Auto play: ${autoPlayCompleted}/${autoPlayTotal} games completed.` 
      });
    }
  }, [autoPlay, autoPlayCompleted, autoPlayTotal]);

  // Clear notification after 5 seconds
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  if (!isLoggedIn) {
    return (
      <div className="App">
        <AuthForm 
          onLogin={handleLogin}
          onRegister={handleRegister}
          isLoading={authLoading}
        />
      </div>
    );
  }

  return (
    <div className={`App ${compactMode ? 'compact-mode' : ''}`}>
      <GameHeader 
        user={user} 
        onLogout={logout} 
        onRefresh={refreshAllData} 
        isRefreshing={isRefreshing}
        compactMode={compactMode}
        onToggleCompactMode={() => setCompactMode(!compactMode)}
      />
      {notification && (
        <div className={`notification ${notification.type}`}>
          {notification.message}
        </div>
      )}
      <div className="game-container">
        <div className="game-main">
          <div className="game-display">
            <div className="multiplier-section">
              <GameDisplay 
                multiplier={multiplier}
                gameActive={gameActive}
                gameEnded={gameEnded}
                gameResult={gameResult}
                betAmount={safeBetAmount}
                autoCashoutEnabled={autoCashoutEnabled}
                autoCashoutValue={autoCashoutValue}
                onStartGame={handleStartGame}
                onCashOut={handleCashOut}
                user={user}
                isLoading={gameLoading}
                autoPlay={autoPlay}
                autoPlayGames={autoPlayGames}
                autoPlayCompleted={autoPlayCompleted}
                autoPlayTotal={autoPlayTotal}
                onStartAutoPlay={handleStartAutoPlay}
                onStopAutoPlay={handleStopAutoPlay}
                onBetChange={setBetAmount}
              />
            </div>
            <div className="chart-section">
              <CrashChart
                chartData={chartData}
                chartAnimation={chartAnimation}
                gameActive={gameActive}
                gameEnded={gameEnded}
                crashMultiplier={crashMultiplier}
                multiplier={multiplier}
                betAmount={safeBetAmount}
                setAutoCashoutValue={setAutoCashoutValue}
                autoCashoutEnabled={autoCashoutEnabled}
              />
            </div>
          </div>
          <GameControls
            betAmount={safeBetAmount}
            onBetChange={setBetAmount}
            gameActive={gameActive}
            user={user}
            isLoading={gameLoading}
            autoCashoutValue={autoCashoutValue}
            setAutoCashoutValue={setAutoCashoutValue}
            autoCashoutEnabled={autoCashoutEnabled}
            setAutoCashoutEnabled={setAutoCashoutEnabled}
            autoPlay={autoPlay}
            autoPlayGames={autoPlayGames}
            setAutoPlayGames={setAutoPlayGames}
            autoPlayDelay={autoPlayDelay}
            setAutoPlayDelay={setAutoPlayDelay}
            autoPlayCompleted={autoPlayCompleted}
            autoPlayTotal={autoPlayTotal}
          />
        </div>
        <div className="game-sidebar">
          <GameStats stats={stats} />
          <GameHistory gameHistory={gameHistory} />
          <RecentCrashes recentCrashes={(gameHistory || []).map(round => ({ multiplier: round.crashed_at }))} />
        </div>
      </div>
      {/* Hidden audio element for sound effects */}
      <audio ref={audioRef} preload="auto" />
    </div>
  );
}

export default App;