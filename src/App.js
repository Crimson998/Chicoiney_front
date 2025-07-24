// Trigger redeploy: dummy comment
import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Crash from './pages/Crash';
import Coinflip from './pages/Coinflip';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/crash" element={<Crash />} />
        <Route path="/coinflip" element={<Coinflip />} />
      </Routes>
    </Router>
  );
}

export default App;