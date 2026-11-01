'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { ShieldCheck, Lock, CheckCircle2, AlertCircle, Eye, EyeOff } from 'lucide-react';

function AcceptInvitationContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { fetchCurrentUser } = useAuth();
  const token = searchParams.get('token') || '';

  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState(null);
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('Missing invitation token.');
      setLoading(false);
      return;
    }

    async function verifyToken() {
      try {
        const res = await fetch(`/api/auth/accept-invitation?token=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Invalid invitation link.');
        }
        setAccount(data.account);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    verifyToken();
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/accept-invitation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to set password.');
      }

      localStorage.setItem('jobzy_token', data.token);
      await fetchCurrentUser(data.token);
      setCompleted(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem', background: '#F8FAFC' }}>
      <div className="card" style={{ width: '100%', maxWidth: '460px', padding: '2rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <Link href="/" style={{ textDecoration: 'none', fontSize: '1.75rem', fontWeight: 800, color: '#142D4E' }}>
            Job<span style={{ color: '#FF7A00' }}>Z</span>y
          </Link>
          <h1 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0F172A', marginTop: '0.5rem' }}>
            Verify Email &amp; Set Password
          </h1>
          <p style={{ fontSize: '0.85rem', color: '#64748B' }}>
            Complete your secure Jobzy account invitation
          </p>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '2rem 0' }}>
            <div className="spinner" />
            <p style={{ fontSize: '0.85rem', color: '#64748B', marginTop: '0.75rem' }}>Verifying invitation link...</p>
          </div>
        ) : completed ? (
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#DCFCE7', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
              <CheckCircle2 size={32} />
            </div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0F172A', marginBottom: '0.5rem' }}>
              Account Activated!
            </h2>
            <p style={{ fontSize: '0.88rem', color: '#475569', marginBottom: '1.5rem' }}>
              Your email ({account?.email}) is verified and your password has been saved.
            </p>
            <button
              onClick={() => router.push(account?.role === 'provider' ? '/provider/dashboard' : '/customer/dashboard')}
              className="btn btn-primary"
              style={{ width: '100%' }}
            >
              Go to Your Dashboard
            </button>
          </div>
        ) : !account ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ padding: '1rem', background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: '10px', color: '#B91C1C', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
              {error || 'Invalid or expired invitation link.'}
            </div>
            <Link href="/" className="btn btn-secondary" style={{ width: '100%' }}>
              Return to Homepage
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {error && (
              <div style={{ padding: '0.75rem', background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: '8px', color: '#B91C1C', fontSize: '0.82rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            <div style={{ background: '#F1F5F9', padding: '0.9rem 1rem', borderRadius: '10px', marginBottom: '1.25rem', fontSize: '0.84rem' }}>
              <div style={{ fontWeight: 700, color: '#0F172A' }}>{account.name}</div>
              <div style={{ color: '#475569' }}>{account.email}</div>
              <div style={{ marginTop: '0.35rem', display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <span className="badge" style={{ background: '#E0F2FE', color: '#0369A1' }}>
                  {account.role === 'provider' ? 'Service Provider' : 'Customer'}
                </span>
                {account.confirmationId && (
                  <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', fontWeight: 700, color: '#1E40AF' }}>
                    ID: {account.confirmationId}
                  </span>
                )}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Create Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  className="form-control"
                  placeholder="Enter at least 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#64748B', cursor: 'pointer' }}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Confirm Password</label>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={6}
                className="form-control"
                placeholder="Re-enter your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>

            <button type="submit" disabled={submitting} className="btn btn-primary" style={{ width: '100%' }}>
              {submitting ? 'Setting Password...' : 'Verify Email & Set Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function AcceptInvitationPage() {
  return (
    <Suspense fallback={<div style={{ padding: '4rem', textAlign: 'center' }}><div className="spinner" /></div>}>
      <AcceptInvitationContent />
    </Suspense>
  );
}

