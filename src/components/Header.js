import React from 'react';
import { Link } from 'react-router-dom';
import './Header.css';
import { useAuthContext } from '../AuthContext';

const Header = () => {
  const { user, isLoggedIn, logout } = useAuthContext();
  return (
    <header className="header-glass">
      <div className="header-logo">StakeYotta</div>
      <nav className="header-nav">
        <Link to="/">Home</Link>
        <Link to="/crash">Crash</Link>
        <Link to="/leaderboard">Leaderboard</Link>
        <Link to="/promotions">Promotions</Link>
        <Link to="/account">Account</Link>
      </nav>
      <div className="header-user">
        {isLoggedIn ? (
          <>
            <span className="header-credits">${user?.credits?.toFixed(2) ?? '0.00'}</span>
            <button className="header-logout" onClick={logout}>Logout</button>
          </>
        ) : (
          <>
            <Link to="/login" className="header-login">Login</Link>
            <Link to="/register" className="header-login">Register</Link>
          </>
        )}
      </div>
    </header>
  );
};

export default Header; 