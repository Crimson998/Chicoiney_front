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
      <a href="https://twitter.com/" target="_blank" rel="noopener noreferrer" aria-label="Twitter">🐦</a>
      <a href="https://discord.com/" target="_blank" rel="noopener noreferrer" aria-label="Discord">💬</a>
      <a href="https://instagram.com/" target="_blank" rel="noopener noreferrer" aria-label="Instagram">📸</a>
    </div>
    <div className="footer-copy">© {new Date().getFullYear()} StakeYotta. All rights reserved.</div>
  </footer>
);

export default Footer; 