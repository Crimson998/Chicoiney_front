// Admin panel - deployment verification comment
import React, { useEffect, useState } from 'react';
import { useAuthContext } from '../AuthContext';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import Footer from '../components/Footer';

const Admin = () => {
  const { user, token, isLoggedIn } = useAuthContext();
  const [users, setUsers] = useState([]);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  // Debugging
  console.log('Admin.js user:', user, 'isLoggedIn:', isLoggedIn);

  // Robust loading state: don't redirect until user is loaded
  if (typeof user === 'undefined') return <div>Loading...</div>;

  useEffect(() => {
    if (typeof user === 'undefined') return; // Wait for user to load
    if (!isLoggedIn) {
      navigate('/login');
      return;
    }
    if (!user?.is_admin) {
      navigate('/');
      return;
    }
    const fetchUsers = async () => {
      try {
        const res = await fetch('https://web-production-fc04.up.railway.app/admin/users', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('Failed to fetch users');
        const data = await res.json();
        setUsers(data);
      } catch (err) {
        setError(err.message);
      }
    };
    fetchUsers();
  }, [isLoggedIn, user, token, navigate]);

  if (!isLoggedIn || !user?.is_admin) return null;
//1
  return (
    <div className="main-bg">
      <Header />
      <div className="auth-container">
        <div className="auth-card">
          <h2 className="auth-title">Admin Panel</h2>
          {error && <div className="error-message">{error}</div>}
          <h3>All Users</h3>
          <table style={{ width: '100%', marginTop: 16, color: '#fff', background: 'rgba(0,0,0,0.2)' }}>
            <thead>
              <tr>
                <th>ID</th>
                <th>Username</th>
                <th>Credits</th>
                <th>Admin</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td>{u.id}</td>
                  <td>{u.username}</td>
                  <td>{u.credits}</td>
                  <td>{u.is_admin ? 'Yes' : 'No'}</td>
                  <td>{u.created_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default Admin; 