'use client';
import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Eye, EyeOff, LogIn, Mail, Lock, ShieldCheck, AlertCircle, CheckCircle2 } from 'lucide-react';

function getSafeAdminReturnUrl(rawReturnTo) {
  if (!rawReturnTo || typeof rawReturnTo !== 'string') return '/admin';
  const trimmed = rawReturnTo.trim();
  if (
    trimmed.startsWith('/admin') &&
    !trimmed.startsWith('//') &&
    !trimmed.startsWith('/admin/login')
  ) {
    return trimmed;
  }
  return '/admin';
}

function AdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, user, loading: authLoading } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const returnTo = getSafeAdminReturnUrl(searchParams?.get('returnTo'));

  // Redirect if already logged in as admin
  useEffect(() => {
    if (!authLoading && user && user.role === 'admin') {
      router.replace(returnTo);
    }
  }, [user, authLoading, router, returnTo]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const data = await login(email, password, 'admin');
      const role = data.user?.role;

      if (role === 'admin') {
        setSuccess('Login successful! Opening administrator workspace…');
        router.replace(returnTo);
      } else {
        setError('This account does not have administrator access.');
      }
    } catch (err) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 60%, #334155 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem 1rem'
      }}
    >
      <div style={{ width: '100%', maxWidth: '420px' }}>
        {/* Logo -> Always stays inside /admin */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <Link href="/admin" style={{ textDecoration: 'none' }} id="admin-login-logo">
            <span style={{ fontSize: '2rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.5px' }}>
              Job<span style={{ color: '#FF7A00' }}>Z</span>y
            </span>
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginTop: '0.75rem' }}>
            <ShieldCheck size={22} color="#F59E0B" />
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#fff', margin: 0 }}>
              Administrator Login
            </h1>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem', marginTop: '0.4rem' }}>
            Jobzy Platform Administration Workspace
          </p>
        </div>

        <div className="card" style={{ padding: '2rem', borderRadius: 'var(--radius-lg)' }}>
          {error && (
            <div
              style={{
                background: 'var(--danger-100)',
                border: '1px solid #FCA5A5',
                borderRadius: 'var(--radius-md)',
                padding: '0.875rem 1rem',
                marginBottom: '1.25rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                color: 'var(--danger-700)',
                fontSize: '0.875rem',
                fontWeight: 600
              }}
            >
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          {success && (
            <div
              style={{
                background: 'var(--success-100)',
                border: '1px solid #6EE7B7',
                borderRadius: 'var(--radius-md)',
                padding: '0.875rem 1rem',
                marginBottom: '1.25rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                color: 'var(--success-700)',
                fontSize: '0.875rem',
                fontWeight: 600
              }}
            >
              <CheckCircle2 size={16} />
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="email">
                <Mail size={14} style={{ marginRight: '0.35rem', verticalAlign: 'middle' }} />
                Email Address
              </label>
              <input
                id="email"
                type="email"
                className="form-control"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@jobzy.lk"
                required
                autoComplete="email"
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="password">
                <Lock size={14} style={{ marginRight: '0.35rem', verticalAlign: 'middle' }} />
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  className="form-control"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  autoComplete="current-password"
                  style={{ paddingRight: '2.75rem' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '0.75rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--slate-500)',
                    padding: 0
                  }}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{
                marginTop: '0.25rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem'
              }}
            >
              {loading ? (
                <>
                  <span className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }} />
                  Authenticating…
                </>
              ) : (
                <>
                  <LogIn size={16} />
                  Log In
                </>
              )}
            </button>
          </form>

          <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.8rem', color: 'var(--slate-400)' }}>
            Restricted to authorized Jobzy platform administrators only.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense
      fallback={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
          <div className="spinner" />
        </div>
      }
    >
      <AdminLoginForm />
    </Suspense>
  );
}
