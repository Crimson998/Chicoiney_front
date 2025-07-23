import React from 'react';
import { Link } from 'react-router-dom';
import Header from '../components/Header';
import Footer from '../components/Footer';
import './Home.css';

const NotFound = () => (
  <div className="main-bg">
    <Header />
    <section className="hero-banner" style={{ marginTop: '4rem', minHeight: '300px' }}>
      <h1 style={{ fontSize: '3rem', color: '#D72660' }}>404</h1>
      <p style={{ fontSize: '1.3rem', marginBottom: '2rem' }}>Page not found.</p>
      <Link to="/" className="hero-cta">Return Home</Link>
    </section>
    <Footer />
  </div>
);

export default NotFound; 