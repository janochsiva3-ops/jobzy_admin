'use client';
import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import {
  AdminAvatarCircle,
  ChangeAdminAvatarModal,
  RemoveAdminAvatarModal,
  hasCustomAdminAvatar
} from '@/components/AdminAvatarModal';
import {
  Wrench, Bell, LogOut, LayoutDashboard,
  Menu, X, ShieldCheck, ChevronDown, Check, Globe, Camera, Trash2
} from 'lucide-react';

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const {
    user, token, logout, notifications, unreadCount,
    markNotificationRead, markAllNotificationsRead,
    updateUser, fetchCurrentUser
  } = useAuth();
  const { lang, setLang, t } = useLanguage();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifDropdownOpen, setNotifDropdownOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [langDropdownOpen, setLangDropdownOpen] = useState(false);
  const [loginDropdownOpen, setLoginDropdownOpen] = useState(false);
  const [registerDropdownOpen, setRegisterDropdownOpen] = useState(false);
  const [mobileLoginOpen, setMobileLoginOpen] = useState(false);
  const [mobileRegisterOpen, setMobileRegisterOpen] = useState(false);
  const [changeAvatarModalOpen, setChangeAvatarModalOpen] = useState(false);
  const [removeAvatarModalOpen, setRemoveAvatarModalOpen] = useState(false);

  const headerRef = useRef(null);
  const loginMenuRef = useRef(null);
  const registerMenuRef = useRef(null);
  const langMenuRef = useRef(null);

  const isAdminRoute = pathname?.startsWith('/admin');
  const isCustomerOrProvider = user && (user.role === 'customer' || user.role === 'provider');

  const closeAllDropdowns = () => {
    setNotifDropdownOpen(false);
    setUserDropdownOpen(false);
    setLangDropdownOpen(false);
    setLoginDropdownOpen(false);
    setRegisterDropdownOpen(false);
  };

  // Close all dropdowns and mobile menu when route changes
  useEffect(() => {
    closeAllDropdowns();
    setMobileMenuOpen(false);
    setMobileLoginOpen(false);
    setMobileRegisterOpen(false);
  }, [pathname]);

  // Close on outside click or Escape key
  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (headerRef.current && !headerRef.current.contains(event.target)) {
        closeAllDropdowns();
        setMobileMenuOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        closeAllDropdowns();
        setMobileMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Keyboard arrow navigation inside dropdown menus
  const handleMenuKeyDown = (e, menuRef) => {
    if (!menuRef.current) return;
    const items = Array.from(menuRef.current.querySelectorAll('[role="menuitem"]'));
    if (!items.length) return;
    const currentIndex = items.indexOf(document.activeElement);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
      items[nextIndex]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
      items[prevIndex]?.focus();
    }
  };

  const getDashboardLink = () => {
    if (!user) return '/';
    if (user.role === 'provider') return '/provider/dashboard';
    if (user.role === 'customer') return '/customer/dashboard';
    return null;
  };

  if (isAdminRoute) {
    return null;
  }

  return (
    <header className="navbar" ref={headerRef}>
      <div className="container navbar-inner">
        {/* Brand Logo (Fully Opaque, Orange Capital Z) */}
        <Link href="/" className="brand-logo" id="jobzy-brand-logo">
          <div className="logo-mark">
            <Wrench size={20} />
          </div>
          <span>Job<span style={{ color: '#FF7A00' }}>Z</span>y</span>
        </Link>

        {/* Public Desktop Navigation Links */}
        {!isAdminRoute ? (
          <nav className="nav-links" aria-label="Main navigation">
            <Link
              href="/"
              className={`nav-link ${pathname === '/' ? 'active' : ''}`}
            >
              Home
            </Link>
            <Link
              href="/#categories"
              className="nav-link"
            >
              Services
            </Link>
            <Link
              href="/find"
              className={`nav-link ${pathname === '/find' ? 'active' : ''}`}
              id="nav-find-pros"
            >
              Find Professionals
            </Link>
            <Link
              href="/how-it-works"
              className={`nav-link ${pathname === '/how-it-works' ? 'active' : ''}`}
            >
              How It Works
            </Link>
            <Link
              href="/about"
              className={`nav-link ${pathname === '/about' ? 'active' : ''}`}
            >
              About
            </Link>
          </nav>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#B45309', background: '#FEF3C7', padding: '0.25rem 0.75rem', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 700 }}>
            <ShieldCheck size={16} />
            <span>Administrator Portal</span>
          </div>
        )}

        {/* Right Actions */}
        <div className="navbar-actions">
          {/* Language Switcher */}
          <div style={{ position: 'relative' }} onKeyDown={(e) => handleMenuKeyDown(e, langMenuRef)}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                const next = !langDropdownOpen;
                closeAllDropdowns();
                setLangDropdownOpen(next);
              }}
              style={{ padding: '0.4rem 0.65rem', background: '#FFFFFF' }}
              aria-label="Language Selector"
              aria-haspopup="menu"
              aria-expanded={langDropdownOpen}
            >
              <Globe size={15} />
              <span style={{ textTransform: 'uppercase', fontWeight: 700, fontSize: '0.8rem' }}>{lang}</span>
              <ChevronDown size={14} style={{ transform: langDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
            </button>

            {langDropdownOpen && (
              <div
                ref={langMenuRef}
                role="menu"
                aria-label="Select language"
                className="navbar-dropdown-menu"
                style={{ minWidth: '140px' }}
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => { setLang('en'); setLangDropdownOpen(false); }}
                  className="navbar-dropdown-item"
                >
                  <span>English</span>
                  {lang === 'en' && <Check size={14} color="#0F766E" />}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => { setLang('si'); setLangDropdownOpen(false); }}
                  className="navbar-dropdown-item"
                >
                  <span>සිංහල</span>
                  {lang === 'si' && <Check size={14} color="#0F766E" />}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => { setLang('ta'); setLangDropdownOpen(false); }}
                  className="navbar-dropdown-item"
                >
                  <span>தமிழ்</span>
                  {lang === 'ta' && <Check size={14} color="#0F766E" />}
                </button>
              </div>
            )}
          </div>

          {/* Authenticated Customer or Provider (or Admin strictly inside Admin Route) */}
          {(isCustomerOrProvider || (user?.role === 'admin' && isAdminRoute)) ? (
            <div className="flex items-center gap-3">
              {/* Notifications */}
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-icon"
                  onClick={() => {
                    const next = !notifDropdownOpen;
                    closeAllDropdowns();
                    setNotifDropdownOpen(next);
                  }}
                  style={{ position: 'relative', background: '#FFFFFF' }}
                  aria-label="View notifications"
                  aria-expanded={notifDropdownOpen}
                >
                  <Bell size={18} />
                  {unreadCount > 0 && (
                    <span style={{
                      position: 'absolute',
                      top: '-3px',
                      right: '-3px',
                      background: '#EF4444',
                      color: '#fff',
                      fontSize: '0.65rem',
                      fontWeight: 800,
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '2px solid #fff'
                    }}>
                      {unreadCount}
                    </span>
                  )}
                </button>

                {notifDropdownOpen && (
                  <div
                    className="navbar-dropdown-menu"
                    style={{ width: '320px' }}
                  >
                    <div style={{ padding: '0.85rem 1rem', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#FFFFFF' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0F172A' }}>Notifications</span>
                      {unreadCount > 0 && (
                        <button
                          type="button"
                          onClick={markAllNotificationsRead}
                          style={{ fontSize: '0.75rem', color: '#0F766E', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}
                        >
                          Mark all read
                        </button>
                      )}
                    </div>
                    <div style={{ maxHeight: '300px', overflowY: 'auto', background: '#FFFFFF' }}>
                      {notifications.length === 0 ? (
                        <div style={{ padding: '1.5rem', textAlign: 'center', color: '#94A3B8', fontSize: '0.85rem' }}>
                          No notifications yet
                        </div>
                      ) : (
                        notifications.map((n) => (
                          <div
                            key={n.id}
                            onClick={() => {
                              markNotificationRead(n.id);
                              if (n.link) router.push(n.link);
                              setNotifDropdownOpen(false);
                            }}
                            style={{
                              padding: '0.75rem 1rem',
                              borderBottom: '1px solid #F8FAFC',
                              background: n.is_read ? '#FFFFFF' : '#E7F3EF',
                              cursor: 'pointer',
                              transition: 'background 0.2s'
                            }}
                          >
                            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#142D4E', marginBottom: '0.2rem' }}>
                              {n.title}
                            </div>
                            <div style={{ fontSize: '0.8rem', color: '#475569', lineHeight: 1.3 }}>
                              {n.message}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: '#94A3B8', marginTop: '0.3rem' }}>
                              {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* User Dropdown */}
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => {
                    const next = !userDropdownOpen;
                    closeAllDropdowns();
                    setUserDropdownOpen(next);
                  }}
                  aria-haspopup="menu"
                  aria-expanded={userDropdownOpen}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.35rem 0.75rem',
                    borderRadius: '9999px',
                    background: '#FFFFFF',
                    border: '1px solid #E2E8F0',
                    cursor: 'pointer'
                  }}
                >
                  {user.role === 'admin' ? (
                    <AdminAvatarCircle user={user} size={28} />
                  ) : (
                    <img
                      src={user.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100'}
                      alt={user.name}
                      style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover' }}
                    />
                  )}
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#142D4E', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {user.name.split(' ')[0]}
                  </span>
                  <span style={{
                    fontSize: '0.65rem',
                    fontWeight: 800,
                    padding: '0.1rem 0.4rem',
                    borderRadius: '4px',
                    background: user.role === 'provider' ? '#E7F3EF' : '#F1F5F9',
                    color: user.role === 'provider' ? '#0F766E' : '#475569',
                    textTransform: 'uppercase'
                  }}>
                    {user.role}
                  </span>
                  <ChevronDown size={14} />
                </button>

                {userDropdownOpen && (
                  <div
                    role="menu"
                    className="navbar-dropdown-menu"
                    style={{ width: user.role === 'admin' ? '230px' : '200px' }}
                  >
                    {user.role === 'admin' && isAdminRoute && (
                      <>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setUserDropdownOpen(false);
                            setChangeAvatarModalOpen(true);
                          }}
                          className="navbar-dropdown-item"
                          style={{ justifyContent: 'flex-start', gap: '0.55rem' }}
                        >
                          <Camera size={16} color="#1D4ED8" />
                          <span>Change Profile Picture</span>
                        </button>

                        {hasCustomAdminAvatar(user) && (
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setUserDropdownOpen(false);
                              setRemoveAvatarModalOpen(true);
                            }}
                            className="navbar-dropdown-item"
                            style={{ justifyContent: 'flex-start', gap: '0.55rem', color: '#DC2626' }}
                          >
                            <Trash2 size={16} color="#DC2626" />
                            <span>Remove Profile Picture</span>
                          </button>
                        )}
                      </>
                    )}

                    {getDashboardLink() && (
                      <Link
                        href={getDashboardLink()}
                        role="menuitem"
                        onClick={() => setUserDropdownOpen(false)}
                        className="navbar-dropdown-item"
                        style={{ justifyContent: 'flex-start', gap: '0.5rem' }}
                      >
                        <LayoutDashboard size={16} color="#0F766E" />
                        <span>Dashboard</span>
                      </Link>
                    )}

                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        logout();
                        setUserDropdownOpen(false);
                        router.push('/');
                      }}
                      className="navbar-dropdown-item"
                      style={{ justifyContent: 'flex-start', gap: '0.5rem', color: '#DC2626' }}
                    >
                      <LogOut size={16} />
                      <span>{t('logOut')}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Public Guest Actions: Login dropdown & Register dropdown */
            <div className="flex items-center gap-2">
              {/* Login Dropdown */}
              <div style={{ position: 'relative' }} onKeyDown={(e) => handleMenuKeyDown(e, loginMenuRef)}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    const next = !loginDropdownOpen;
                    closeAllDropdowns();
                    setLoginDropdownOpen(next);
                  }}
                  id="btn-login-header"
                  aria-haspopup="menu"
                  aria-expanded={loginDropdownOpen}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 600, background: '#FFFFFF' }}
                >
                  <span>Login</span>
                  <ChevronDown size={14} style={{ transform: loginDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                </button>
                {loginDropdownOpen && (
                  <div
                    ref={loginMenuRef}
                    role="menu"
                    aria-label="Login options"
                    className="navbar-dropdown-menu"
                  >
                    <Link
                      href="/customer/login"
                      role="menuitem"
                      onClick={() => setLoginDropdownOpen(false)}
                      className="navbar-dropdown-item"
                    >
                      <span>Customer Login</span>
                    </Link>
                    <Link
                      href="/provider/login"
                      role="menuitem"
                      onClick={() => setLoginDropdownOpen(false)}
                      className="navbar-dropdown-item"
                    >
                      <span>Service Provider Login</span>
                    </Link>
                  </div>
                )}
              </div>

              {/* Register Dropdown (Replaces Become a Service Provider) */}
              <div style={{ position: 'relative' }} onKeyDown={(e) => handleMenuKeyDown(e, registerMenuRef)}>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    const next = !registerDropdownOpen;
                    closeAllDropdowns();
                    setRegisterDropdownOpen(next);
                  }}
                  id="btn-register-header"
                  aria-haspopup="menu"
                  aria-expanded={registerDropdownOpen}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 600 }}
                >
                  <span>Register</span>
                  <ChevronDown size={14} style={{ transform: registerDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                </button>
                {registerDropdownOpen && (
                  <div
                    ref={registerMenuRef}
                    role="menu"
                    aria-label="Register options"
                    className="navbar-dropdown-menu"
                  >
                    <Link
                      href="/customer/register"
                      role="menuitem"
                      onClick={() => setRegisterDropdownOpen(false)}
                      className="navbar-dropdown-item"
                    >
                      <span>Register as Customer</span>
                    </Link>
                    <Link
                      href="/provider/register"
                      role="menuitem"
                      onClick={() => setRegisterDropdownOpen(false)}
                      className="navbar-dropdown-item"
                    >
                      <span>Register as Service Provider</span>
                    </Link>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Mobile Hamburger Button */}
          <button
            type="button"
            className="btn btn-secondary btn-icon navbar-mobile-toggle"
            onClick={() => {
              closeAllDropdowns();
              setMobileMenuOpen(!mobileMenuOpen);
            }}
            style={{ background: '#FFFFFF' }}
            aria-label="Toggle mobile menu"
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile Navigation Drawer (Solid Readable Background) */}
      {mobileMenuOpen && (
        <div style={{
          background: 'rgba(255, 255, 255, 0.98)',
          borderTop: '1px solid #E2E8F0',
          padding: '1.25rem 1.5rem',
          boxShadow: '0 12px 24px rgba(15, 23, 42, 0.1)'
        }}>
          <div className="flex flex-col gap-3">
            <Link
              href="/"
              onClick={() => setMobileMenuOpen(false)}
              style={{ fontWeight: 600, padding: '0.4rem 0', color: '#0F172A' }}
            >
              Home
            </Link>
            <Link
              href="/#categories"
              onClick={() => setMobileMenuOpen(false)}
              style={{ fontWeight: 600, padding: '0.4rem 0', color: '#0F172A' }}
            >
              Services
            </Link>
            <Link
              href="/find"
              onClick={() => setMobileMenuOpen(false)}
              style={{ fontWeight: 600, padding: '0.4rem 0', color: '#0F172A' }}
            >
              Find Professionals
            </Link>
            <Link
              href="/how-it-works"
              onClick={() => setMobileMenuOpen(false)}
              style={{ fontWeight: 600, padding: '0.4rem 0', color: '#0F172A' }}
            >
              How It Works
            </Link>
            <Link
              href="/about"
              onClick={() => setMobileMenuOpen(false)}
              style={{ fontWeight: 600, padding: '0.4rem 0', color: '#0F172A' }}
            >
              About
            </Link>
            <Link
              href="/contact"
              onClick={() => setMobileMenuOpen(false)}
              style={{ fontWeight: 600, padding: '0.4rem 0', color: '#0F172A' }}
            >
              Contact
            </Link>

            {/* Authenticated user dashboard link */}
            {isCustomerOrProvider && getDashboardLink() && (
              <Link
                href={getDashboardLink()}
                onClick={() => setMobileMenuOpen(false)}
                style={{
                  fontWeight: 700,
                  padding: '0.6rem 1rem',
                  background: '#E7F3EF',
                  borderRadius: '8px',
                  color: '#0F766E',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  marginTop: '0.5rem'
                }}
              >
                <LayoutDashboard size={18} />
                <span>Open Dashboard</span>
              </Link>
            )}

            {/* If not logged in as customer/provider, show expandable Login & Register dropdowns */}
            {!isCustomerOrProvider && (
              <div style={{ borderTop: '1px solid #E2E8F0', marginTop: '0.5rem', paddingTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {/* Mobile Login Dropdown */}
                <div>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileLoginOpen(!mobileLoginOpen);
                      setMobileRegisterOpen(false);
                    }}
                    className="btn btn-secondary btn-sm"
                    aria-expanded={mobileLoginOpen}
                    style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  >
                    <span>Login</span>
                    <ChevronDown size={15} style={{ transform: mobileLoginOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                  </button>
                  {mobileLoginOpen && (
                    <div style={{ marginTop: '0.4rem', border: '1px solid #E2E8F0', borderRadius: '10px', background: '#FFFFFF', overflow: 'hidden' }}>
                      <Link
                        href="/customer/login"
                        onClick={() => setMobileMenuOpen(false)}
                        className="navbar-dropdown-item"
                      >
                        <span>Customer Login</span>
                      </Link>
                      <Link
                        href="/provider/login"
                        onClick={() => setMobileMenuOpen(false)}
                        className="navbar-dropdown-item"
                      >
                        <span>Service Provider Login</span>
                      </Link>
                    </div>
                  )}
                </div>

                {/* Mobile Register Dropdown */}
                <div>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileRegisterOpen(!mobileRegisterOpen);
                      setMobileLoginOpen(false);
                    }}
                    className="btn btn-primary btn-sm"
                    aria-expanded={mobileRegisterOpen}
                    style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  >
                    <span>Register</span>
                    <ChevronDown size={15} style={{ transform: mobileRegisterOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                  </button>
                  {mobileRegisterOpen && (
                    <div style={{ marginTop: '0.4rem', border: '1px solid #E2E8F0', borderRadius: '10px', background: '#FFFFFF', overflow: 'hidden' }}>
                      <Link
                        href="/customer/register"
                        onClick={() => setMobileMenuOpen(false)}
                        className="navbar-dropdown-item"
                      >
                        <span>Register as Customer</span>
                      </Link>
                      <Link
                        href="/provider/register"
                        onClick={() => setMobileMenuOpen(false)}
                        className="navbar-dropdown-item"
                      >
                        <span>Register as Service Provider</span>
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {user?.role === 'admin' && isAdminRoute && (
        <>
          <ChangeAdminAvatarModal
            isOpen={changeAvatarModalOpen}
            user={user}
            token={token}
            onClose={() => setChangeAvatarModalOpen(false)}
            onSaved={(updatedUser) => {
              if (updatedUser) updateUser(updatedUser);
              fetchCurrentUser();
            }}
          />
          <RemoveAdminAvatarModal
            isOpen={removeAvatarModalOpen}
            user={user}
            token={token}
            onClose={() => setRemoveAvatarModalOpen(false)}
            onRemoved={(updatedUser) => {
              if (updatedUser) updateUser(updatedUser);
              else updateUser({ avatar: null });
              fetchCurrentUser();
            }}
          />
        </>
      )}
    </header>
  );
}
