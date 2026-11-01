'use client';
import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import {
  AdminAvatarCircle,
  ChangeAdminAvatarModal,
  RemoveAdminAvatarModal,
  hasCustomAdminAvatar
} from '@/components/AdminAvatarModal';
import {
  Wrench,
  Bell,
  LogOut,
  ShieldCheck,
  ChevronDown,
  Camera,
  Trash2
} from 'lucide-react';

export default function AdminWorkspaceHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const {
    user,
    token,
    logout,
    notifications,
    unreadCount,
    markNotificationRead,
    markAllNotificationsRead,
    updateUser,
    fetchCurrentUser
  } = useAuth();

  const [notifDropdownOpen, setNotifDropdownOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [changeAvatarModalOpen, setChangeAvatarModalOpen] = useState(false);
  const [removeAvatarModalOpen, setRemoveAvatarModalOpen] = useState(false);

  const headerRef = useRef(null);

  const closeAllDropdowns = () => {
    setNotifDropdownOpen(false);
    setUserDropdownOpen(false);
  };

  useEffect(() => {
    closeAllDropdowns();
  }, [pathname]);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (headerRef.current && !headerRef.current.contains(event.target)) {
        closeAllDropdowns();
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        closeAllDropdowns();
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Do not render the workspace top bar on the standalone /admin/login screen
  if (pathname === '/admin/login') {
    return null;
  }

  const isAdmin = user && user.role === 'admin';

  const resolveAdminNotificationTab = (n) => {
    const title = (n?.title || '').toLowerCase();
    const type = (n?.type || '').toLowerCase();
    if (type === 'payment' || title.includes('payment') || title.includes('fee') || title.includes('subscription') || title.includes('refund')) {
      return 'payments';
    }
    if (type === 'verification' || title.includes('provider') || title.includes('verification') || title.includes('approval')) {
      return 'verifications';
    }
    if (type === 'booking' || title.includes('booking')) {
      return 'bookings';
    }
    if (title.includes('customer')) {
      return 'customers';
    }
    return 'notifications';
  };

  const handleAdminLogout = () => {
    setUserDropdownOpen(false);
    logout();
    router.replace('/admin/login');
  };

  return (
    <header
      className="navbar admin-workspace-header"
      ref={headerRef}
      style={{
        background: '#FFFFFF',
        borderBottom: '1px solid #E2E8F0',
        position: 'sticky',
        top: 0,
        zIndex: 100
      }}
    >
      <div className="container navbar-inner" style={{ maxWidth: '1440px' }}>
        {/* Left: Admin Workspace Brand Logo -> Always links to /admin */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <Link href="/admin" className="brand-logo" id="admin-brand-logo" title="Admin Workspace Home">
            <div className="logo-mark">
              <Wrench size={20} />
            </div>
            <span>
              Job<span style={{ color: '#FF7A00' }}>Z</span>y
            </span>
          </Link>

          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              color: '#B45309',
              background: '#FEF3C7',
              border: '1px solid #FDE68A',
              padding: '0.25rem 0.7rem',
              borderRadius: '6px',
              fontSize: '0.78rem',
              fontWeight: 700
            }}
          >
            <ShieldCheck size={15} />
            <span>Administrator Workspace</span>
          </div>
        </div>

        {/* Right: Admin-Only Controls (Notifications + Admin Avatar / Account Menu) */}
        {isAdmin && (
          <div className="navbar-actions">
            <div className="flex items-center gap-3">
              {/* Admin Notifications */}
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
                  aria-label="View administrator notifications"
                  aria-expanded={notifDropdownOpen}
                >
                  <Bell size={18} />
                  {unreadCount > 0 && (
                    <span
                      style={{
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
                      }}
                    >
                      {unreadCount}
                    </span>
                  )}
                </button>

                {notifDropdownOpen && (
                  <div className="navbar-dropdown-menu" style={{ width: '320px' }}>
                    <div
                      style={{
                        padding: '0.85rem 1rem',
                        borderBottom: '1px solid #F1F5F9',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        background: '#FFFFFF'
                      }}
                    >
                      <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0F172A' }}>
                        Admin Notifications
                      </span>
                      {unreadCount > 0 && (
                        <button
                          type="button"
                          onClick={markAllNotificationsRead}
                          style={{
                            fontSize: '0.75rem',
                            color: '#1D4ED8',
                            fontWeight: 600,
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer'
                          }}
                        >
                          Mark all read
                        </button>
                      )}
                    </div>
                    <div style={{ maxHeight: '300px', overflowY: 'auto', background: '#FFFFFF' }}>
                      {notifications.length === 0 ? (
                        <div
                          style={{
                            padding: '1.5rem',
                            textAlign: 'center',
                            color: '#94A3B8',
                            fontSize: '0.85rem'
                          }}
                        >
                          No notifications yet
                        </div>
                      ) : (
                        notifications.map((n) => (
                          <div
                            key={n.id}
                            onClick={() => {
                              markNotificationRead(n.id);
                              setNotifDropdownOpen(false);
                              const targetTab = resolveAdminNotificationTab(n);
                              router.push(`/admin?tab=${targetTab}`);
                            }}
                            style={{
                              padding: '0.75rem 1rem',
                              borderBottom: '1px solid #F8FAFC',
                              background: n.is_read ? '#FFFFFF' : '#EFF6FF',
                              cursor: 'pointer',
                              transition: 'background 0.2s'
                            }}
                          >
                            <div
                              style={{
                                fontSize: '0.85rem',
                                fontWeight: 700,
                                color: '#142D4E',
                                marginBottom: '0.2rem'
                              }}
                            >
                              {n.title}
                            </div>
                            <div style={{ fontSize: '0.8rem', color: '#475569', lineHeight: 1.3 }}>
                              {n.message}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: '#94A3B8', marginTop: '0.3rem' }}>
                              {new Date(n.created_at).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Admin Profile Picture & Account Dropdown */}
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  id="admin-account-menu-trigger"
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
                  <AdminAvatarCircle user={user} size={28} />
                  <span
                    style={{
                      fontSize: '0.85rem',
                      fontWeight: 700,
                      color: '#142D4E',
                      maxWidth: '120px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {user.name.split(' ')[0]}
                  </span>
                  <span
                    style={{
                      fontSize: '0.65rem',
                      fontWeight: 800,
                      padding: '0.1rem 0.4rem',
                      borderRadius: '4px',
                      background: '#FEF3C7',
                      color: '#B45309',
                      textTransform: 'uppercase'
                    }}
                  >
                    {user.role}
                  </span>
                  <ChevronDown size={14} />
                </button>

                {userDropdownOpen && (
                  <div role="menu" className="navbar-dropdown-menu" style={{ width: '230px' }}>
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

                    <button
                      type="button"
                      role="menuitem"
                      id="admin-logout-btn"
                      onClick={handleAdminLogout}
                      className="navbar-dropdown-item"
                      style={{ justifyContent: 'flex-start', gap: '0.5rem', color: '#DC2626' }}
                    >
                      <LogOut size={16} />
                      <span>Log Out</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {isAdmin && (
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

