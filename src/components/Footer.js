import React from 'react';
import './Footer.css';

const Footer = () => (
  <footer className="footer-glass">
    <div className="footer-links">
      <a href="/about">About</a>
      <a href="/terms">Terms</a>
      <a href="/privacy">Privacy</a>
      <a href="/responsible">Responsible Gaming</a>
      <a href="/support">Support</a>
    </div>
    <div className="footer-socials">
      <a href="#" aria-label="Twitter">🐦</a>
      <a href="#" aria-label="Discord">💬</a>
      <a href="#" aria-label="Instagram">📸</a>
    </div>
    <div className="footer-copy">© {new Date().getFullYear()} StakeYotta. All rights reserved.</div>
  </footer>
);

export default Footer; 