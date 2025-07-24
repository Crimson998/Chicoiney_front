// Crash game page - moved from original App.js
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import axios from 'axios';
import '../App.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://127.0.0.1:8000';

// --- Begin Crash game logic (moved from App.js) ---
// (All custom hooks, components, and logic from App.js, except the router)

// Custom hooks
const useAuth = () => {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [user, setUser] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

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

// ... (Copy the rest of the Crash game logic: useGame, AuthForm, GameHeader, GameDisplay, GameControls, RecentCrashes, GameHistory, GameStats, CrashChart, etc.)
// ...

// Main Crash Component
function Crash() {
  // Copy the main App function body, but rename to Crash
  // (All state, hooks, and UI from App.js, except the router)
  // ...
  // (Paste the full body of App from App.js here, updating export default Crash at the end)
}

export default Crash; 