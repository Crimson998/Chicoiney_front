// Admin panel - deployment verification comment
import React, { useEffect, useState } from 'react';
import { useAuthContext } from '../AuthContext';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import Footer from '../components/Footer';

const API_BASE_URL = 'https://web-production-fc04.up.railway.app';

const Admin = () => {
  const { user, token, isLoggedIn } = useAuthContext();
  const [users, setUsers] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profitStats, setProfitStats] = useState(null);
  const [houseEdge, setHouseEdge] = useState('');
  const [houseEdgeLoading, setHouseEdgeLoading] = useState(false);
  const [houseEdgeMsg, setHouseEdgeMsg] = useState('');
  const navigate = useNavigate();

  // Debugging
  console.log('Admin.js user:', user, 'isLoggedIn:', isLoggedIn);

  // Fetch users
  const fetchUsers = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch users');
      const data = await res.json();
      setUsers(data);
    } catch (err) {
      setError(err.message);
    }
  };

  // Fetch profit stats
  const fetchProfitStats = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/profit`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch profit stats');
      const data = await res.json();
      setProfitStats(data);
      setHouseEdge((data.house_edge_percent || '').toString());
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    if (typeof user === 'undefined') {
      setLoading(true);
      return;
    }
    setLoading(false);
    if (!isLoggedIn) {
      navigate('/login');
      return;
    }
    if (!user?.is_admin) {
      navigate('/');
      return;
    }
    fetchUsers();
    fetchProfitStats();
    // eslint-disable-next-line
  }, [isLoggedIn, user, token, navigate]);

  // User actions
  const handleCreditChange = async (id) => {
    const credits = prompt('Enter new credits amount:');
    if (!credits || isNaN(credits)) return alert('Invalid amount');
    try {
      const res = await fetch(`${API_BASE_URL}/admin/user/${id}/credits`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ credits: parseFloat(credits) }),
      });
      if (!res.ok) throw new Error('Failed to update credits');
      await fetchUsers();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleToggleAdmin = async (id, isAdmin) => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/user/${id}/admin`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ is_admin: !isAdmin }),
      });
      if (!res.ok) throw new Error('Failed to toggle admin');
      await fetchUsers();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteUser = async (id) => {
    if (!window.confirm('Are you sure you want to delete this user?')) return;
    try {
      const res = await fetch(`${API_BASE_URL}/admin/user/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to delete user');
      await fetchUsers();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleHouseEdgeChange = (e) => {
    setHouseEdge(e.target.value);
  };

  const handleAdjustHouseEdge = async (e) => {
    e.preventDefault();
    setHouseEdgeLoading(true);
    setHouseEdgeMsg('');
    try {
      const edge = parseFloat(houseEdge) / 100;
      if (isNaN(edge) || edge < 0.01 || edge > 0.15) throw new Error('Edge must be between 1 and 15');
      const res = await fetch(`${API_BASE_URL}/admin/adjust-house-edge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ new_edge: edge }),
      });
      if (!res.ok) throw new Error('Failed to adjust house edge');
      const data = await res.json();
      setHouseEdgeMsg(data.message || 'House edge updated');
      await fetchProfitStats();
    } catch (err) {
      setHouseEdgeMsg(err.message);
    } finally {
      setHouseEdgeLoading(false);
    }
  };

  if (loading || typeof user === 'undefined') return <div>Loading...</div>;
  if (!isLoggedIn || !user?.is_admin) return null;

  return (
    <div className="main-bg">
      <Header />
      <div className="admin-panel-container">
        <div className="auth-card admin-panel-card">
          <h2 className="auth-title">Admin Panel</h2>
          {error && <div className="error-message">{error}</div>}
          <h3>All Users</h3>
          <div className="admin-table-container">
            <table style={{ width: '100%', marginTop: 16, color: '#fff', background: 'rgba(0,0,0,0.2)' }}>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Username</th>
                  <th>Credits</th>
                  <th>Admin</th>
                  <th>Created</th>
                  <th>Actions</th>
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
                    <td>
                      <button onClick={() => handleCreditChange(u.id)}>Edit Credits</button>{' '}
                      <button onClick={() => handleToggleAdmin(u.id, u.is_admin)}>{u.is_admin ? 'Revoke Admin' : 'Make Admin'}</button>{' '}
                      <button onClick={() => handleDeleteUser(u.id)} style={{ color: 'red' }}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 style={{ marginTop: 32 }}>House Profit & Settings</h3>
          {profitStats ? (
            <div style={{ color: '#fff', background: 'rgba(0,0,0,0.2)', padding: 16, borderRadius: 8 }}>
              <div>Total Bets: {profitStats.total_bets}</div>
              <div>Total Bet Amount: ${profitStats.total_bet_amount}</div>
              <div>Total Paid Out: ${profitStats.total_paid_out}</div>
              <div>House Profit: ${profitStats.house_profit}</div>
              <div>Profit Margin: {profitStats.profit_margin_percent}%</div>
              <div>Theoretical Profit: ${profitStats.theoretical_profit}</div>
              <div>Profit Efficiency: {profitStats.profit_efficiency_percent}%</div>
              <div>House Edge: {profitStats.house_edge_percent}%</div>
              <div>RTP: {profitStats.rtp_percent}%</div>
              <form onSubmit={handleAdjustHouseEdge} style={{ marginTop: 16 }}>
                <label>
                  Adjust House Edge (%):
                  <input
                    type="number"
                    min="1"
                    max="15"
                    step="0.01"
                    value={houseEdge}
                    onChange={handleHouseEdgeChange}
                    style={{ marginLeft: 8, width: 80 }}
                  />
                </label>
                <button type="submit" disabled={houseEdgeLoading} style={{ marginLeft: 8 }}>
                  {houseEdgeLoading ? 'Updating...' : 'Update'}
                </button>
                {houseEdgeMsg && <span style={{ marginLeft: 16 }}>{houseEdgeMsg}</span>}
              </form>
            </div>
          ) : (
            <div>Loading profit stats...</div>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default Admin; 