'use client';
import React, { useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { SRI_LANKA_DISTRICTS } from '@/lib/sriLankaData';
import { X, ShieldCheck, User, Wrench, Lock, Mail, Phone, MapPin, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function AuthModal() {
  const pathname = usePathname();
  const { authModalOpen, authModalTab, closeAuth, setAuthModalTab, login, register } = useAuth();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Customer register state
  const [custName, setCustName] = useState('');
  const [custEmail, setCustEmail] = useState('');
  const [custPassword, setCustPassword] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [custDistrict, setCustDistrict] = useState('Colombo');
  const [custCity, setCustCity] = useState('');

  // Provider register state
  const [provName, setProvName] = useState('');
  const [provEmail, setProvEmail] = useState('');
  const [provPassword, setProvPassword] = useState('');
  const [provPhone, setProvPhone] = useState('');
  const [provDistrict, setProvDistrict] = useState('Colombo');
  const [provCity, setProvCity] = useState('');
  const [provCategory, setProvCategory] = useState('cat-electrician');
  const [provTitle, setProvTitle] = useState('');
  const [provExperience, setProvExperience] = useState('5');
  const [provPricingType, setProvPricingType] = useState('hourly');
  const [provBaseRate, setProvBaseRate] = useState('1800');
  const [provSkills, setProvSkills] = useState('');
  const [provNic, setProvNic] = useState('');

  if (!authModalOpen || pathname?.startsWith('/admin')) return null;

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(loginEmail, loginPassword);
    } catch (err) {
      setError(err.message || 'Login failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleCustomerRegister = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await register({
        name: custName,
        email: custEmail,
        password: custPassword,
        role: 'customer',
        phone: custPhone,
        district: custDistrict,
        city: custCity
      });
    } catch (err) {
      setError(err.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleProviderRegister = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await register({
        name: provName,
        email: provEmail,
        password: provPassword,
        role: 'provider',
        phone: provPhone,
        district: provDistrict,
        city: provCity,
        categoryId: provCategory,
        title: provTitle || 'Skilled Professional',
        experienceYears: parseInt(provExperience, 10) || 3,
        pricingType: provPricingType,
        baseRate: parseFloat(provBaseRate) || 1500,
        skills: provSkills ? provSkills.split(',').map(s => s.trim()) : ['General Trade Service'],
        verificationDocs: [
          { type: 'National Identity Card (NIC)', number: provNic || 'NIC-PENDING', verified: false, date: new Date().toISOString() }
        ]
      });
    } catch (err) {
      setError(err.message || 'Provider registration failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={closeAuth}>
      <div 
        className="modal-content" 
        onClick={(e) => e.stopPropagation()} 
        style={{ maxWidth: authModalTab === 'register_provider' ? '680px' : '480px' }}
      >
        {/* Header */}
        <div className="modal-header">
          <div>
            <h3 style={{ fontSize: '1.25rem', color: '#0F172A' }}>
              {authModalTab === 'login' && 'Welcome Back to Jobzy'}
              {authModalTab === 'register' && 'Create Customer Account'}
              {authModalTab === 'register_provider' && 'Register as a Service Provider'}
              {authModalTab === 'forgot' && 'Reset Your Password'}
            </h3>
            <p style={{ fontSize: '0.8rem', color: '#64748B' }}>
              {authModalTab === 'login' && 'Log in to manage bookings, messages, and quotes.'}
              {authModalTab === 'register' && 'Book verified Sri Lankan trade professionals.'}
              {authModalTab === 'register_provider' && 'Join Sri Lanka’s trusted service marketplace.'}
              {authModalTab === 'forgot' && 'We will send reset instructions to your email.'}
            </p>
          </div>
          <button onClick={closeAuth} className="btn-icon" style={{ color: '#64748B' }}>
            <X size={20} />
          </button>
        </div>

        {/* Tab Switcher */}
        {authModalTab !== 'forgot' && (
          <div style={{ display: 'flex', borderBottom: '1px solid #E2E8F0', background: '#F8FAFC' }}>
            <button
              onClick={() => { setAuthModalTab('login'); setError(null); }}
              style={{
                flex: 1,
                padding: '0.75rem',
                fontWeight: 700,
                fontSize: '0.85rem',
                color: authModalTab === 'login' ? '#1D4ED8' : '#64748B',
                borderBottom: authModalTab === 'login' ? '2px solid #1D4ED8' : 'none',
                background: authModalTab === 'login' ? '#fff' : 'transparent'
              }}
            >
              Log In
            </button>
            <button
              onClick={() => { setAuthModalTab('register'); setError(null); }}
              style={{
                flex: 1,
                padding: '0.75rem',
                fontWeight: 700,
                fontSize: '0.85rem',
                color: authModalTab === 'register' ? '#1D4ED8' : '#64748B',
                borderBottom: authModalTab === 'register' ? '2px solid #1D4ED8' : 'none',
                background: authModalTab === 'register' ? '#fff' : 'transparent'
              }}
            >
              Customer Sign Up
            </button>
            <button
              onClick={() => { setAuthModalTab('register_provider'); setError(null); }}
              style={{
                flex: 1,
                padding: '0.75rem',
                fontWeight: 700,
                fontSize: '0.85rem',
                color: authModalTab === 'register_provider' ? '#10B981' : '#64748B',
                borderBottom: authModalTab === 'register_provider' ? '2px solid #10B981' : 'none',
                background: authModalTab === 'register_provider' ? '#fff' : 'transparent'
              }}
            >
              Become a Provider
            </button>
          </div>
        )}

        <div className="modal-body">
          {error && (
            <div style={{
              background: '#FEE2E2',
              color: '#B91C1C',
              padding: '0.75rem',
              borderRadius: '8px',
              fontSize: '0.85rem',
              marginBottom: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div style={{
              background: '#D1FAE5',
              color: '#065F46',
              padding: '0.75rem',
              borderRadius: '8px',
              fontSize: '0.85rem',
              marginBottom: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <CheckCircle2 size={16} />
              <span>{success}</span>
            </div>
          )}

          {/* 1. LOGIN FORM */}
          {authModalTab === 'login' && (
            <form onSubmit={handleLoginSubmit}>
              <div className="form-group">
                <label className="form-label">Email Address</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="email"
                    required
                    className="form-control"
                    placeholder="e.g. customer@jobzy.lk"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    id="input-login-email"
                  />
                </div>
              </div>

              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                  <label className="form-label" style={{ margin: 0 }}>Password</label>
                  <button 
                    type="button" 
                    onClick={() => setAuthModalTab('forgot')}
                    style={{ fontSize: '0.75rem', color: '#1D4ED8', fontWeight: 600 }}
                  >
                    Forgot password?
                  </button>
                </div>
                <input
                  type="password"
                  required
                  className="form-control"
                  placeholder="••••••••"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  id="input-login-password"
                />
              </div>

              <button 
                type="submit" 
                className="btn btn-primary"
                disabled={loading}
                style={{ width: '100%', marginTop: '0.5rem' }}
                id="btn-login-submit"
              >
                {loading ? 'Authenticating...' : 'Sign In to Jobzy'}
              </button>
            </form>
          )}

          {/* 2. CUSTOMER SIGN UP */}
          {authModalTab === 'register' && (
            <form onSubmit={handleCustomerRegister}>
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input
                  type="text"
                  required
                  className="form-control"
                  placeholder="e.g. Dilani Wickramasinghe"
                  value={custName}
                  onChange={(e) => setCustName(e.target.value)}
                  id="input-cust-name"
                />
              </div>

              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Email Address</label>
                  <input
                    type="email"
                    required
                    className="form-control"
                    placeholder="name@example.com"
                    value={custEmail}
                    onChange={(e) => setCustEmail(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Phone Number</label>
                  <input
                    type="tel"
                    required
                    className="form-control"
                    placeholder="+94 7X XXX XXXX"
                    value={custPhone}
                    onChange={(e) => setCustPhone(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">District</label>
                  <select
                    className="form-control"
                    value={custDistrict}
                    onChange={(e) => setCustDistrict(e.target.value)}
                  >
                    {SRI_LANKA_DISTRICTS.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">City / Town</label>
                  <input
                    type="text"
                    required
                    className="form-control"
                    placeholder="e.g. Nawala, Rajagiriya"
                    value={custCity}
                    onChange={(e) => setCustCity(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Create Password</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  className="form-control"
                  placeholder="At least 6 characters"
                  value={custPassword}
                  onChange={(e) => setCustPassword(e.target.value)}
                />
              </div>

              <button 
                type="submit" 
                className="btn btn-primary"
                disabled={loading}
                style={{ width: '100%', marginTop: '0.5rem' }}
              >
                {loading ? 'Creating Account...' : 'Complete Customer Registration'}
              </button>
            </form>
          )}

          {/* 3. PROVIDER SIGN UP */}
          {authModalTab === 'register_provider' && (
            <form onSubmit={handleProviderRegister}>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Full Name / Business Name</label>
                  <input
                    type="text"
                    required
                    className="form-control"
                    placeholder="e.g. Rohan Jayasinghe"
                    value={provName}
                    onChange={(e) => setProvName(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Professional Title</label>
                  <input
                    type="text"
                    required
                    className="form-control"
                    placeholder="e.g. Master Electrician & Solar Inverters"
                    value={provTitle}
                    onChange={(e) => setProvTitle(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Email Address</label>
                  <input
                    type="email"
                    required
                    className="form-control"
                    placeholder="pro@jobzy.lk"
                    value={provEmail}
                    onChange={(e) => setProvEmail(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Contact Phone</label>
                  <input
                    type="tel"
                    required
                    className="form-control"
                    placeholder="+94 77 XXX XXXX"
                    value={provPhone}
                    onChange={(e) => setProvPhone(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid-3">
                <div className="form-group">
                  <label className="form-label">Primary Trade</label>
                  <select
                    className="form-control"
                    value={provCategory}
                    onChange={(e) => setProvCategory(e.target.value)}
                  >
                    <option value="cat-electrician">Electricians</option>
                    <option value="cat-plumber">Plumbers</option>
                    <option value="cat-carpenter">Carpenters</option>
                    <option value="cat-tutor">Teachers & Tutors</option>
                    <option value="cat-technician">Technicians & CCTV</option>
                    <option value="cat-appliance">Appliance Repair</option>
                    <option value="cat-cleaner">Cleaners</option>
                    <option value="cat-masonry">Masonry & Painting</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Experience (Years)</label>
                  <input
                    type="number"
                    min="1"
                    className="form-control"
                    value={provExperience}
                    onChange={(e) => setProvExperience(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Pricing Basis</label>
                  <select
                    className="form-control"
                    value={provPricingType}
                    onChange={(e) => setProvPricingType(e.target.value)}
                  >
                    <option value="hourly">Hourly Rate (LKR)</option>
                    <option value="fixed">Fixed-Price Service</option>
                    <option value="quote">Quotation Required</option>
                  </select>
                </div>
              </div>

              <div className="grid-2">
                {provPricingType !== 'quote' && (
                  <div className="form-group">
                    <label className="form-label">Rate (LKR)</label>
                    <input
                      type="number"
                      min="500"
                      step="100"
                      className="form-control"
                      value={provBaseRate}
                      onChange={(e) => setProvBaseRate(e.target.value)}
                    />
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">NIC / Business Reg. No.</label>
                  <input
                    type="text"
                    required
                    className="form-control"
                    placeholder="e.g. 198224501234 / BR-8491"
                    value={provNic}
                    onChange={(e) => setProvNic(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">District Base</label>
                  <select
                    className="form-control"
                    value={provDistrict}
                    onChange={(e) => setProvDistrict(e.target.value)}
                  >
                    {SRI_LANKA_DISTRICTS.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Base Town</label>
                  <input
                    type="text"
                    required
                    className="form-control"
                    placeholder="e.g. Nugegoda, Colombo"
                    value={provCity}
                    onChange={(e) => setProvCity(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Skills & Specialties (comma-separated)</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. Three-Phase, Solar Inverters, LECO Certified, Conduit Wiring"
                  value={provSkills}
                  onChange={(e) => setProvSkills(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Account Password</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  className="form-control"
                  placeholder="••••••••"
                  value={provPassword}
                  onChange={(e) => setProvPassword(e.target.value)}
                />
              </div>

              <div style={{
                background: '#F0FDF4',
                border: '1px solid #BBF7D0',
                borderRadius: '8px',
                padding: '0.75rem',
                fontSize: '0.8rem',
                color: '#166534',
                marginBottom: '1rem'
              }}>
                <strong>Verification Notice:</strong> Your profile will be submitted to Jobzy administrators for document vetting. The Verified Badge will appear upon approval.
              </div>

              <button 
                type="submit" 
                className="btn btn-success"
                disabled={loading}
                style={{ width: '100%' }}
              >
                {loading ? 'Submitting Registration...' : 'Submit Provider Registration'}
              </button>
            </form>
          )}

          {/* 4. FORGOT PASSWORD SIMULATION */}
          {authModalTab === 'forgot' && (
            <div>
              <p style={{ fontSize: '0.85rem', color: '#475569', marginBottom: '1rem' }}>
                Enter the email address registered with your Jobzy account. We will dispatch a password recovery link.
              </p>
              <form onSubmit={(e) => {
                e.preventDefault();
                setSuccess('Password reset link has been dispatched to your email address.');
              }}>
                <div className="form-group">
                  <label className="form-label">Email Address</label>
                  <input type="email" required className="form-control" placeholder="name@example.com" />
                </div>
                <button type="submit" className="btn btn-primary" style={{ width: '100%', marginBottom: '1rem' }}>
                  Send Recovery Link
                </button>
                <button 
                  type="button" 
                  onClick={() => setAuthModalTab('login')} 
                  style={{ width: '100%', fontSize: '0.85rem', color: '#64748B', fontWeight: 600 }}
                >
                  &larr; Return to Sign In
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
