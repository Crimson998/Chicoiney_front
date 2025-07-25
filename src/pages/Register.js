import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Header from '../components/Header';
import Footer from '../components/Footer';
import '../pages/Home.css';
import { useAuthContext } from '../AuthContext';

const Register = () => {
  const { register, isLoading } = useAuthContext();
  const [formData, setFormData] = useState({ username: '', password: '' });
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    try {
      await register(formData.username, formData.password);
      setSuccess(true);
      setTimeout(() => navigate('/login'), 1200);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="main-bg">
      <Header />
      <div className="auth-container">
        <div className="auth-card">
          <h2 className="auth-title">Register</h2>
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
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                value={formData.password}
                onChange={e => setFormData({ ...formData, password: e.target.value })}
                required
                minLength={6}
                disabled={isLoading}
              />
              <button
                type="button"
                className="show-password-btn"
                onClick={() => setShowPassword((prev) => !prev)}
                tabIndex={-1}
                style={{ marginLeft: 8, padding: '0.25rem 0.5rem', fontSize: '0.9em', cursor: 'pointer' }}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            {error && <div className="error-message">{error}</div>}
            {success && <div className="notification success">Registration successful! Redirecting to login...</div>}
            <button className="auth-button" type="submit" disabled={isLoading}>
              {isLoading ? 'Registering...' : 'Register'}
            </button>
          </form>
          <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
            <span>Already have an account? </span>
            <Link to="/login" style={{ color: '#6C2EB7', fontWeight: 600 }}>Login</Link>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default Register; 