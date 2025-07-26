import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Header from '../components/Header';
import Footer from '../components/Footer';
import '../pages/Home.css';
import { useAuthContext } from '../AuthContext';

const Login = () => {
  const { login, isLoading, isLoggedIn } = useAuthContext();
  const [formData, setFormData] = useState({ username: '', password: '' });
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  if (isLoggedIn) {
    navigate('/');
    return null;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await login(formData.username, formData.password);
      navigate('/');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="main-bg">
      <Header />
      <div className="auth-container">
        <div className="auth-card">
          <h2 className="auth-title">Login</h2>
          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <input
                type="text"
                placeholder="Username"
                value={formData.username}
                onChange={e => setFormData({ ...formData, username: e.target.value })}
                required
                minLength={3}
                disabled={isLoading}
              />
            </div>
            <div className="form-group password-group">
              <input
                type="password"
                placeholder="Password"
                value={formData.password}
                onChange={e => setFormData({ ...formData, password: e.target.value })}
                required
                minLength={6}
                disabled={isLoading}
              />
            </div>
            {error && <div className="error-message">{error}</div>}
            <button className="auth-button" type="submit" disabled={isLoading}>
              {isLoading ? 'Logging in...' : 'Login'}
            </button>
          </form>
          <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
            <span>Don&apos;t have an account? </span>
            <Link to="/register" style={{ color: '#6C2EB7', fontWeight: 600 }}>Register</Link>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default Login; 