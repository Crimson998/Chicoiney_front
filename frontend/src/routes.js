import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Home from './pages/Home';
import Crash from './pages/Crash';
import Leaderboard from './pages/Leaderboard';
import Promotions from './pages/Promotions';
import Account from './pages/Account';
import NotFound from './pages/NotFound';
import Login from './pages/Login';
import Register from './pages/Register';
import { useAuthContext } from './AuthContext';

const ProtectedRoute = ({ children }) => {
  const { isLoggedIn } = useAuthContext();
  return isLoggedIn ? children : <Navigate to="/login" replace />;
};

const AppRoutes = () => (
  <Router>
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/crash" element={<ProtectedRoute><Crash /></ProtectedRoute>} />
      <Route path="/leaderboard" element={<ProtectedRoute><Leaderboard /></ProtectedRoute>} />
      <Route path="/promotions" element={<ProtectedRoute><Promotions /></ProtectedRoute>} />
      <Route path="/account" element={<ProtectedRoute><Account /></ProtectedRoute>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  </Router>
);

export default AppRoutes; 