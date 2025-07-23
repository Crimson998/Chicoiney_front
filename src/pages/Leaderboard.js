import React from 'react';
import Header from '../components/Header';
import Footer from '../components/Footer';
import '../pages/Home.css';

const leaderboard = [
  { rank: 1, name: 'LuckyPlayer', win: '$12,345' },
  { rank: 2, name: 'CrashKing', win: '$8,900' },
  { rank: 3, name: 'Streaker', win: '$7,500' },
  { rank: 4, name: 'RiskyBiz', win: '$6,200' },
  { rank: 5, name: 'Multiplier', win: '$5,800' },
];

const Leaderboard = () => (
  <div className="main-bg">
    <Header />
    <section className="leaderboard-section">
      <h1 className="leaderboard-title">Leaderboard</h1>
      <table className="leaderboard-table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Player</th>
            <th>Biggest Win</th>
          </tr>
        </thead>
        <tbody>
          {leaderboard.map(player => (
            <tr key={player.rank}>
              <td>{player.rank}</td>
              <td>{player.name}</td>
              <td>{player.win}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
    <Footer />
  </div>
);

export default Leaderboard; 