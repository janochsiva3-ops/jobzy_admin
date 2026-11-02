'use client';
import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import AdminPaymentsSection from '@/components/AdminPaymentsSection';
import {
  AccountActionsMenu,
  AddEditAccountModal,
  SuspendAccountModal,
  RemoveAccountModal
} from '@/components/AdminAccountModals';
import { AdminAvatarCircle } from '@/components/AdminAvatarModal';
import { formatSriLankaDateTime } from '@/lib/dateUtils';
import { 
  Users, ShieldCheck, Calendar, Star, DollarSign, 
  Settings, CheckCircle2, XCircle, AlertCircle, RefreshCw, 
  Search, Eye, Plus, Megaphone, TrendingUp, Bell, Check, 
  X, Clock, MapPin, Briefcase, FileText, ChevronRight, 
  MessageSquare, ArrowRight, AlertTriangle, Filter, ExternalLink,
  Shield, CheckCheck, UserCheck, UserX, Info, Tag, ShieldAlert, Trash2, Database
} from 'lucide-react';

export default function AdminDashboardPage() {
  const router = useRouter();
  const pathname = usePathname();
  const {
    user,
    token,
    loading: authLoading,
    logout,
    notifications,
    unreadCount,
    markNotificationRead,
    fetchNotifications,
    deleteNotifications,
    fetchCurrentUser
  } = useAuth();

  // Active navigation tab
  // Options: 'overview' | 'customers' | 'providers' | 'verifications' | 'bookings' | 'payments' | 'notifications' | 'categories' | 'reviews' | 'promotions' | 'settings'
  const [activeTab, setActiveTabState] = useState('overview');
  const [loading, setLoading] = useState(true);

  const VALID_ADMIN_TABS = [
    'overview',
    'customers',
    'providers',
    'verifications',
    'bookings',
    'payments',
    'notifications',
    'categories',
    'reviews',
    'promotions',
    'settings'
  ];

  // Sync activeTab with URL ?tab= query parameter so links & session-expiry returnTo preserve the active section
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      if (tabParam && VALID_ADMIN_TABS.includes(tabParam)) {
        setActiveTabState(tabParam);
      }
    }
  }, [pathname]);

  const setActiveTab = useCallback((nextTab) => {
    setActiveTabState(nextTab);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (nextTab === 'overview') {
        url.searchParams.delete('tab');
      } else {
        url.searchParams.set('tab', nextTab);
      }
      window.history.replaceState(null, '', `${url.pathname}${url.search}`);
    }
  }, []);

  // Stats
  const [stats, setStats] = useState({
    customersCount: 0,
    providersCount: 0,
    approvedProvidersCount: 0,
    pendingVerificationsCount: 0,
    changesRequestedCount: 0,
    newRegistrationsCount: 0,
    bookingsCount: 0,
    completedJobsCount: 0,
    activeBookingsCount: 0,
    grossVolumeLKR: 0,
    recordedCommissionLKR: 0
  });

  // Notifications drawer in header & Notifications tab selection/deletion state
  const [showNotifMenu, setShowNotifMenu] = useState(false);
  const [selectedNotifIds, setSelectedNotifIds] = useState([]);
  const [notifPage, setNotifPage] = useState(1);
  const [notifDeleteConfirmModal, setNotifDeleteConfirmModal] = useState({
    open: false,
    ids: [],
    mode: 'bulk' // 'bulk' | 'single'
  });
  const [deletingNotifs, setDeletingNotifs] = useState(false);
  const [notifDeleteError, setNotifDeleteError] = useState('');
  const NOTIFICATIONS_PER_PAGE = 15;

  // 1. Customers Tab State
  const [customers, setCustomers] = useState([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerStatusFilter, setCustomerStatusFilter] = useState('all');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerModalLoading, setCustomerModalLoading] = useState(false);

  // 2. Providers Tab State
  const [providers, setProviders] = useState([]);
  const [providerSearch, setProviderSearch] = useState('');
  const [providerVerifFilter, setProviderVerifFilter] = useState('all');
  const [providerStatusFilter, setProviderStatusFilter] = useState('all');
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [providerModalLoading, setProviderModalLoading] = useState(false);

  // Account Management Modals State (Add, Edit, Suspend/Reactivate, Remove)
  const [accountModal, setAccountModal] = useState({ open: false, mode: 'add', role: 'customer', data: null });
  const [suspendModal, setSuspendModal] = useState({ open: false, role: 'customer', account: null });
  const [removeModal, setRemoveModal] = useState({ open: false, role: 'customer', account: null });

  // 3. Pending Approvals Tab State
  const [verifications, setVerifications] = useState([]);
  const [reviewModalProvider, setReviewModalProvider] = useState(null);
  const [decisionAction, setDecisionAction] = useState('approved'); // 'approved' | 'rejected' | 'request_changes'
  const [decisionNotes, setDecisionNotes] = useState('');
  const [submittingDecision, setSubmittingDecision] = useState(false);

  // 4. Bookings Tab State
  const [bookings, setBookings] = useState([]);
  const [bookingSearch, setBookingSearch] = useState('');
  const [bookingStatusFilter, setBookingStatusFilter] = useState('all');
  const [bookingPaymentFilter, setBookingPaymentFilter] = useState('all');
  const [bookingDateFilter, setBookingDateFilter] = useState('');
  const [selectedBooking, setSelectedBooking] = useState(null);

  // 5. Categories State
  const [categoriesList, setCategoriesList] = useState([]);
  const [newCatName, setNewCatName] = useState('');
  const [newCatIcon, setNewCatIcon] = useState('Wrench');
  const [newCatDesc, setNewCatDesc] = useState('');

  // 6. Reviews State
  const [reviewsList, setReviewsList] = useState([]);

  // 7. Settings State
  const [commissionRate, setCommissionRate] = useState('0.10');
  const [registrationFee, setRegistrationFee] = useState('2500');
  const [sponsoredFee, setSponsoredFee] = useState('4500');
  const [settingsSaved, setSettingsSaved] = useState(false);

  // 8. Promotions State
  const [promotionsData, setPromotionsData] = useState({ ads: [], sponsoredProviders: [] });
  const [newAdTitle, setNewAdTitle] = useState('');
  const [newAdBannerText, setNewAdBannerText] = useState('');
  const [newAdLinkUrl, setNewAdLinkUrl] = useState('');

  // Protect Admin Access & preserve returnTo on session expiry
  useEffect(() => {
    if (!authLoading) {
      const currentAdminPath =
        typeof window !== 'undefined'
          ? `${window.location.pathname}${window.location.search || ''}`
          : pathname || '/admin';
      const returnParam =
        currentAdminPath.startsWith('/admin') && !currentAdminPath.startsWith('/admin/login')
          ? `?returnTo=${encodeURIComponent(currentAdminPath)}`
          : '';

      if (!user || user.role !== 'admin') {
        router.replace(`/admin/login${returnParam}`);
      }
    }
  }, [user, authLoading, router, pathname]);

  const [syncingSupabase, setSyncingSupabase] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState(null);

  // Load all dashboard data
  const loadAdminData = useCallback(async (isManualRefresh = false) => {
    if (!token || user?.role !== 'admin') return;
    setLoading(true);

    try {
      const headers = {
        Authorization: `Bearer ${token}`,
        'Cache-Control': 'no-cache'
      };
      const refreshParam = isManualRefresh ? '&refresh=1' : '';
      const refreshSolo = isManualRefresh ? '?refresh=1' : '';

      const [
        statsRes,
        customersRes,
        providersRes,
        verifRes,
        bookingsRes,
        catsRes,
        reviewsRes,
        settingsRes,
        promRes
      ] = await Promise.all([
        fetch(`/api/admin/stats${refreshSolo}`, { headers }),
        fetch(`/api/admin/customers?search=${encodeURIComponent(customerSearch)}&status=${customerStatusFilter}${refreshParam}`, { headers }),
        fetch(`/api/admin/providers?search=${encodeURIComponent(providerSearch)}&verificationStatus=${providerVerifFilter}&status=${providerStatusFilter}${refreshParam}`, { headers }),
        fetch(`/api/admin/verifications${refreshSolo}`, { headers }),
        fetch(`/api/admin/bookings?search=${encodeURIComponent(bookingSearch)}&status=${bookingStatusFilter}&paymentStatus=${bookingPaymentFilter}&date=${bookingDateFilter}${refreshParam}`, { headers }),
        fetch('/api/categories'),
        fetch(`/api/admin/reviews${refreshSolo}`, { headers }).catch(() => null),
        fetch(`/api/admin/settings${refreshSolo}`, { headers }).catch(() => null),
        fetch(`/api/admin/promotions${refreshSolo}`, { headers }).catch(() => null)
      ]);

      // Handle expired/revoked admin session
      if (statsRes.status === 401 || statsRes.status === 403) {
        const currentAdminPath =
          typeof window !== 'undefined'
            ? `${window.location.pathname}${window.location.search || ''}`
            : '/admin';
        logout();
        router.replace(`/admin/login?returnTo=${encodeURIComponent(currentAdminPath)}`);
        return;
      }

      if (statsRes.ok) setStats(await statsRes.json());
      if (customersRes.ok) setCustomers(await customersRes.json());
      if (providersRes.ok) setProviders(await providersRes.json());
      if (verifRes.ok) setVerifications(await verifRes.json());
      if (bookingsRes.ok) setBookings(await bookingsRes.json());
      if (catsRes.ok) setCategoriesList(await catsRes.json());
      if (reviewsRes && reviewsRes.ok) setReviewsList(await reviewsRes.json());

      if (settingsRes && settingsRes.ok) {
        const s = await settingsRes.json();
        if (s.settings) {
          setCommissionRate(s.settings.platform_commission_rate || '0.10');
          setRegistrationFee(s.settings.provider_registration_fee || '2500');
          setSponsoredFee(s.settings.sponsored_listing_fee_monthly || '4500');
        }
      }

      if (promRes && promRes.ok) {
        setPromotionsData(await promRes.json());
      }
    } catch (err) {
      console.error('Error loading admin data:', err);
    } finally {
      setLoading(false);
    }
  }, [
    token, user, customerSearch, customerStatusFilter, 
    providerSearch, providerVerifFilter, providerStatusFilter, 
    bookingSearch, bookingStatusFilter, bookingPaymentFilter, bookingDateFilter
  ]);

  const handleSyncSupabase = async () => {
    if (!token || syncingSupabase) return;
    setSyncingSupabase(true);
    try {
      const res = await fetch('/api/admin/supabase/sync', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setLastSyncTime(new Date());
        await loadAdminData(true);
      }
    } catch (e) {
      console.error('Supabase sync error:', e);
    } finally {
      setSyncingSupabase(false);
    }
  };

  useEffect(() => {
    if (token && user?.role === 'admin') {
      loadAdminData();
    }
  }, [loadAdminData, token, user]);

  // Mark all notifications as read
  const handleMarkAllNotificationsRead = async () => {
    if (!token) return;
    try {
      await fetch('/api/notifications', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (fetchNotifications) {
        await fetchNotifications();
      }
      loadAdminData();
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  };

  // Prune selectedNotifIds if notifications list changes, and keep current page in bounds
  useEffect(() => {
    const existingIds = new Set((notifications || []).map((n) => n.id));
    setSelectedNotifIds((prev) => {
      const filtered = prev.filter((id) => existingIds.has(id));
      return filtered.length === prev.length ? prev : filtered;
    });
    const maxPage = Math.max(1, Math.ceil((notifications || []).length / NOTIFICATIONS_PER_PAGE));
    if (notifPage > maxPage) {
      setNotifPage(maxPage);
    }
  }, [notifications, notifPage, NOTIFICATIONS_PER_PAGE]);

  // Close notification deletion modal on Escape key
  useEffect(() => {
    if (!notifDeleteConfirmModal.open) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape' && !deletingNotifs) {
        setNotifDeleteConfirmModal({ open: false, ids: [], mode: 'bulk' });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [notifDeleteConfirmModal.open, deletingNotifs]);

  const totalNotifPages = Math.max(1, Math.ceil((notifications || []).length / NOTIFICATIONS_PER_PAGE));
  const safeNotifPage = Math.min(Math.max(1, notifPage), totalNotifPages);
  const currentPageNotifications = (notifications || []).slice(
    (safeNotifPage - 1) * NOTIFICATIONS_PER_PAGE,
    safeNotifPage * NOTIFICATIONS_PER_PAGE
  );
  const currentPageNotifIds = currentPageNotifications.map((n) => n.id);
  const allCurrentPageSelected =
    currentPageNotifIds.length > 0 &&
    currentPageNotifIds.every((id) => selectedNotifIds.includes(id));
  const someCurrentPageSelected =
    currentPageNotifIds.some((id) => selectedNotifIds.includes(id));

  const handleToggleSelectNotif = (notifId, e) => {
    if (e) e.stopPropagation();
    setNotifDeleteError('');
    setSelectedNotifIds((prev) =>
      prev.includes(notifId) ? prev.filter((id) => id !== notifId) : [...prev, notifId]
    );
  };

  const handleToggleSelectAllCurrentPage = () => {
    setNotifDeleteError('');
    if (allCurrentPageSelected) {
      // Unselect only notifications on the current page
      const currentSet = new Set(currentPageNotifIds);
      setSelectedNotifIds((prev) => prev.filter((id) => !currentSet.has(id)));
    } else {
      // Select all notifications on the current page
      setSelectedNotifIds((prev) => Array.from(new Set([...prev, ...currentPageNotifIds])));
    }
  };

  const handleClearNotifSelection = () => {
    setNotifDeleteError('');
    setSelectedNotifIds([]);
  };

  const handleOpenDeleteNotifModal = (ids, mode = 'bulk', e = null) => {
    if (e) e.stopPropagation();
    const targetIds = (Array.isArray(ids) ? ids : [ids]).filter(Boolean);
    if (targetIds.length === 0) return;
    setNotifDeleteError('');
    setNotifDeleteConfirmModal({
      open: true,
      ids: targetIds,
      mode
    });
  };

  const handleConfirmDeleteNotifications = async () => {
    if (deletingNotifs || !notifDeleteConfirmModal.ids.length) return;
    setDeletingNotifs(true);
    setNotifDeleteError('');

    const targetIds = notifDeleteConfirmModal.ids;
    try {
      await deleteNotifications(targetIds);
      const deletedSet = new Set(targetIds);
      setSelectedNotifIds((prev) => prev.filter((id) => !deletedSet.has(id)));
      setNotifDeleteConfirmModal({ open: false, ids: [], mode: 'bulk' });
    } catch (err) {
      setNotifDeleteError(
        err?.message || 'Failed to delete notifications from your inbox. Please try again.'
      );
    } finally {
      setDeletingNotifs(false);
    }
  };

  const handleOpenNotificationTarget = (n) => {
    if (!n.is_read) {
      markNotificationRead(n.id);
    }
    const titleLower = (n.title || '').toLowerCase();
    const linkStr = n.link || '';
    if (linkStr.includes('tab=payments') || n.type === 'payment' || n.type === 'subscription') {
      setActiveTab('payments');
    } else if (linkStr.includes('tab=verifications') || n.type === 'verification' || titleLower.includes('provider')) {
      setActiveTab('verifications');
    } else if (linkStr.includes('tab=bookings') || n.type === 'booking' || titleLower.includes('booking')) {
      setActiveTab('bookings');
    } else if (linkStr.includes('tab=customers') || titleLower.includes('customer')) {
      setActiveTab('customers');
    }
  };

  // View Customer Details
  const handleViewCustomerDetails = async (customerId) => {
    setCustomerModalLoading(true);
    setSelectedCustomer(null);
    try {
      const res = await fetch(`/api/admin/customers/${customerId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setSelectedCustomer(await res.json());
      } else {
        alert('Could not fetch customer details.');
      }
    } catch (err) {
      alert('Error loading customer.');
    } finally {
      setCustomerModalLoading(false);
    }
  };

  // Toggle Customer Status via Suspend/Reactivate Modal
  const handleToggleCustomerStatus = (customerObj) => {
    setSuspendModal({ open: true, role: 'customer', account: customerObj });
  };

  // View Provider Details
  const handleViewProviderDetails = async (providerId) => {
    setProviderModalLoading(true);
    setSelectedProvider(null);
    try {
      const res = await fetch(`/api/admin/providers/${providerId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setSelectedProvider(await res.json());
      } else {
        alert('Could not fetch provider details.');
      }
    } catch (err) {
      alert('Error loading provider.');
    } finally {
      setProviderModalLoading(false);
    }
  };

  // Toggle Provider Status via Suspend/Reactivate Modal
  const handleToggleProviderStatus = (providerObj) => {
    setSuspendModal({ open: true, role: 'provider', account: providerObj });
  };

  // Restore Removed Account
  const handleRestoreAccount = async (account, role) => {
    if (!confirm(`Restore ${role} account "${account.name}" (${account.email}) to active status?`)) return;
    try {
      const endpoint =
        role === 'customer'
          ? `/api/admin/customers/${account.id}`
          : `/api/admin/providers/${account.id}`;
      const res = await fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'restore', reason: 'Restored by administrator from Removed Accounts list' })
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to restore account.');
      } else {
        alert(data.message || 'Account restored.');
        loadAdminData();
        if (role === 'customer' && selectedCustomer?.customer?.id === account.id) {
          handleViewCustomerDetails(account.id);
        }
        if (role === 'provider' && selectedProvider?.provider?.id === account.id) {
          handleViewProviderDetails(account.id);
        }
      }
    } catch (err) {
      alert('Network error while restoring account.');
    }
  };

  // Submit Approval / Rejection / Request Changes decision
  const handleSubmitDecision = async (e) => {
    e.preventDefault();
    if (!reviewModalProvider) return;

    if ((decisionAction === 'rejected' || decisionAction === 'request_changes') && !decisionNotes.trim()) {
      alert(decisionAction === 'rejected'
        ? 'A rejection reason is required.'
        : 'Please specify what changes or corrections the provider must submit.'
      );
      return;
    }

    setSubmittingDecision(true);
    try {
      const res = await fetch(`/api/admin/verifications/${reviewModalProvider.id}/decision`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          decision: decisionAction,
          notes: decisionNotes.trim()
        })
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to submit decision.');
      } else {
        alert(`Success: ${data.message}`);
        setReviewModalProvider(null);
        setDecisionNotes('');
        loadAdminData();
      }
    } catch (err) {
      alert('Network error while recording decision.');
    } finally {
      setSubmittingDecision(false);
    }
  };

  // Update Booking Status from Admin
  const handleUpdateBookingStatus = async (bookingId, newStatus, newPaymentStatus) => {
    try {
      const res = await fetch('/api/admin/bookings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          bookingId,
          status: newStatus,
          paymentStatus: newPaymentStatus
        })
      });
      const data = await res.json();
      if (res.ok) {
        loadAdminData();
        if (selectedBooking && selectedBooking.id === bookingId) {
          setSelectedBooking(prev => ({
            ...prev,
            status: newStatus || prev.status,
            payment_status: newPaymentStatus || prev.payment_status
          }));
        }
      } else {
        alert(data.error || 'Failed to update booking.');
      }
    } catch (err) {
      alert('Failed to update booking.');
    }
  };

  // Save Settings
  const handleSaveSettings = async (e) => {
    e.preventDefault();
    try {
      await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ key: 'platform_commission_rate', value: commissionRate })
      });
      await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ key: 'provider_registration_fee', value: registrationFee })
      });
      await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ key: 'sponsored_listing_fee_monthly', value: sponsoredFee })
      });
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 3000);
      loadAdminData();
    } catch (err) {
      alert('Failed to update platform settings.');
    }
  };

  if (authLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div className="spinner" />
      </div>
    );
  }

  if (!user || user.role !== 'admin') {
    return (
      <div className="section container" style={{ textAlign: 'center', padding: '5rem 1rem' }}>
        <ShieldAlert size={48} color="#DC2626" style={{ margin: '0 auto 1rem auto' }} />
        <h2>Private Administrator Access Required</h2>
        <p style={{ color: '#64748B', margin: '1rem 0 1.5rem 0' }}>
          This page and all underlying platform controls are strictly restricted to authenticated administrators.
        </p>
        <button onClick={() => router.push('/admin/login')} className="btn btn-primary">
          Log In as Administrator
        </button>
      </div>
    );
  }

  return (
    <div className="dashboard-layout">
      {/* Sidebar Navigation */}
      <aside className="dashboard-sidebar">
        <div style={{ padding: '0 0.5rem 1.5rem 0.5rem', borderBottom: '1px solid #E2E8F0', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <AdminAvatarCircle user={user} size={42} />
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontWeight: 800, color: '#0F172A', fontSize: '0.95rem', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                {user.name}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#D97706', fontWeight: 700 }}>
                System Administrator
              </div>
            </div>
          </div>
        </div>

        <ul className="sidebar-menu">
          <li>
            <button 
              className={`sidebar-item ${activeTab === 'overview' ? 'active' : ''}`}
              onClick={() => setActiveTab('overview')}
              style={{ width: '100%', textAlign: 'left' }}
            >
              <TrendingUp size={18} />
              <span>Overview</span>
            </button>
          </li>
          <li>
            <button 
              className={`sidebar-item ${activeTab === 'customers' ? 'active' : ''}`}
              onClick={() => setActiveTab('customers')}
              style={{ width: '100%', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <Users size={18} />
                <span>Customers</span>
              </div>
              <span className="badge" style={{ background: '#E2E8F0', color: '#475569', fontSize: '0.75rem', padding: '0.1rem 0.45rem' }}>
                {stats.customersCount}
              </span>
            </button>
          </li>
          <li>
            <button 
              className={`sidebar-item ${activeTab === 'providers' ? 'active' : ''}`}
              onClick={() => setActiveTab('providers')}
              style={{ width: '100%', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <Briefcase size={18} />
                <span>Service Providers</span>
              </div>
              <span className="badge" style={{ background: '#E2E8F0', color: '#475569', fontSize: '0.75rem', padding: '0.1rem 0.45rem' }}>
                {stats.providersCount}
              </span>
            </button>
          </li>
          <li>
            <button 
              className={`sidebar-item ${activeTab === 'verifications' ? 'active' : ''}`}
              onClick={() => setActiveTab('verifications')}
              style={{ width: '100%', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <ShieldCheck size={18} />
                <span>Pending Approvals</span>
              </div>
              {stats.pendingVerificationsCount > 0 && (
                <span className="badge" style={{ background: '#FEF3C7', color: '#B45309', fontWeight: 800, fontSize: '0.75rem', padding: '0.1rem 0.45rem' }}>
                  {stats.pendingVerificationsCount}
                </span>
              )}
            </button>
          </li>
          <li>
            <button 
              className={`sidebar-item ${activeTab === 'bookings' ? 'active' : ''}`}
              onClick={() => setActiveTab('bookings')}
              style={{ width: '100%', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <Calendar size={18} />
                <span>Bookings</span>
              </div>
              <span className="badge" style={{ background: '#E2E8F0', color: '#475569', fontSize: '0.75rem', padding: '0.1rem 0.45rem' }}>
                {stats.bookingsCount}
              </span>
            </button>
          </li>
          <li>
            <button 
              className={`sidebar-item ${activeTab === 'payments' ? 'active' : ''}`}
              onClick={() => setActiveTab('payments')}
              style={{ width: '100%', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <DollarSign size={18} />
                <span>Payments &amp; Subscriptions</span>
              </div>
              <span className="badge" style={{ background: '#DCFCE7', color: '#166534', fontWeight: 700, fontSize: '0.7rem', padding: '0.1rem 0.4rem' }}>
                LKR
              </span>
            </button>
          </li>
          <li>
            <button 
              className={`sidebar-item ${activeTab === 'notifications' ? 'active' : ''}`}
              onClick={() => setActiveTab('notifications')}
              style={{ width: '100%', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <Bell size={18} />
                <span>Messages & Alerts</span>
              </div>
              {unreadCount > 0 && (
                <span className="badge" style={{ background: '#EF4444', color: '#FFFFFF', fontWeight: 800, fontSize: '0.75rem', padding: '0.1rem 0.45rem' }}>
                  {unreadCount}
                </span>
              )}
            </button>
          </li>
          <li>
            <button 
              className={`sidebar-item ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => setActiveTab('settings')}
              style={{ width: '100%', textAlign: 'left' }}
            >
              <Settings size={18} />
              <span>Settings</span>
            </button>
          </li>
        </ul>

        {/* Secondary Admin Sections */}
        <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid #E2E8F0' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: '#94A3B8', padding: '0 0.5rem 0.5rem', letterSpacing: '0.05em' }}>
            Catalog & Moderation
          </div>
          <ul className="sidebar-menu">
            <li>
              <button 
                className={`sidebar-item ${activeTab === 'categories' ? 'active' : ''}`}
                onClick={() => setActiveTab('categories')}
                style={{ width: '100%', textAlign: 'left' }}
              >
                <Tag size={16} />
                <span>Categories</span>
              </button>
            </li>
            <li>
              <button 
                className={`sidebar-item ${activeTab === 'reviews' ? 'active' : ''}`}
                onClick={() => setActiveTab('reviews')}
                style={{ width: '100%', textAlign: 'left' }}
              >
                <Star size={16} />
                <span>Reviews</span>
              </button>
            </li>
            <li>
              <button 
                className={`sidebar-item ${activeTab === 'promotions' ? 'active' : ''}`}
                onClick={() => setActiveTab('promotions')}
                style={{ width: '100%', textAlign: 'left' }}
              >
                <Megaphone size={16} />
                <span>Promotions & Ads</span>
              </button>
            </li>
          </ul>
        </div>
      </aside>

      {/* Main Admin Content */}
      <main className="dashboard-main">
        {/* Administrator Top Bar */}
        <header style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingBottom: '1.25rem',
          marginBottom: '1.5rem',
          borderBottom: '1px solid #E2E8F0',
          flexWrap: 'wrap',
          gap: '1rem'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#D97706', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Jobzy Administration Console
              </span>
              <span style={{ background: '#FEF3C7', color: '#B45309', padding: '0.1rem 0.5rem', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700 }}>
                Private / Internal
              </span>
            </div>
            <h1 style={{ fontSize: '1.6rem', color: '#0F172A', margin: '0.2rem 0 0 0', textTransform: 'capitalize' }}>
              {activeTab === 'verifications' ? 'Pending Approvals' : activeTab.replace('-', ' ')}
            </h1>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', position: 'relative' }}>
            {/* Supabase Cloud Live Sync Button */}
            <button
              onClick={handleSyncSupabase}
              disabled={syncingSupabase}
              className="btn btn-secondary btn-sm"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                borderColor: '#CBD5E1',
                background: syncingSupabase ? '#F1F5F9' : '#FFFFFF',
                color: '#0F766E'
              }}
              title="Force pull fresh records directly from Supabase Cloud"
            >
              <Database size={14} className={syncingSupabase ? 'spin' : ''} />
              <span>{syncingSupabase ? 'Syncing Supabase…' : 'Sync Supabase'}</span>
            </button>

            {/* Refresh Button */}
            <button
              onClick={() => loadAdminData(true)}
              className="btn btn-secondary btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
              title="Refresh database records"
            >
              <RefreshCw size={14} className={loading ? 'spin' : ''} />
              <span>Refresh</span>
            </button>

            {/* Notification Bell with Badge & Dropdown */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowNotifMenu(!showNotifMenu)}
                className="btn btn-secondary btn-sm"
                style={{ position: 'relative', padding: '0.45rem 0.65rem' }}
                aria-label="Administrator Notifications"
              >
                <Bell size={18} />
                {unreadCount > 0 && (
                  <span style={{
                    position: 'absolute',
                    top: '-4px',
                    right: '-4px',
                    background: '#EF4444',
                    color: '#fff',
                    borderRadius: '9999px',
                    fontSize: '0.65rem',
                    fontWeight: 800,
                    minWidth: '18px',
                    height: '18px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 4px',
                    border: '2px solid #fff'
                  }}>
                    {unreadCount}
                  </span>
                )}
              </button>

              {/* Notification Popover */}
              {showNotifMenu && (
                <div style={{
                  position: 'absolute',
                  right: 0,
                  top: '120%',
                  width: '360px',
                  maxWidth: '90vw',
                  background: '#FFFFFF',
                  borderRadius: '12px',
                  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                  border: '1px solid #E2E8F0',
                  zIndex: 200,
                  overflow: 'hidden'
                }}>
                  <div style={{
                    padding: '0.75rem 1rem',
                    background: '#F8FAFC',
                    borderBottom: '1px solid #E2E8F0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#0F172A' }}>
                      Admin Notifications ({unreadCount} unread)
                    </span>
                    {unreadCount > 0 && (
                      <button
                        onClick={handleMarkAllNotificationsRead}
                        style={{ background: 'none', border: 'none', color: '#1D4ED8', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600 }}
                      >
                        Mark all as read
                      </button>
                    )}
                  </div>

                  <div style={{ maxHeight: '340px', overflowY: 'auto' }}>
                    {notifications.length === 0 ? (
                      <div style={{ padding: '2rem 1rem', textAlign: 'center', color: '#94A3B8', fontSize: '0.85rem' }}>
                        No notifications to display.
                      </div>
                    ) : (
                      notifications.slice(0, 8).map(n => (
                        <div
                          key={n.id}
                          style={{
                            padding: '0.75rem 1rem',
                            borderBottom: '1px solid #F1F5F9',
                            background: n.is_read ? '#FFFFFF' : '#F0F9FF',
                            cursor: 'pointer'
                          }}
                          onClick={() => {
                            if (!n.is_read) markNotificationRead(n.id);
                            setShowNotifMenu(false);
                            if (n.type === 'verification' || n.title?.toLowerCase().includes('provider')) {
                              setActiveTab('verifications');
                            } else if (n.type === 'booking') {
                              setActiveTab('bookings');
                            } else if (n.title?.toLowerCase().includes('customer')) {
                              setActiveTab('customers');
                            }
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.2rem' }}>
                            <span style={{ fontWeight: 700, fontSize: '0.8rem', color: '#0F172A' }}>
                              {n.title}
                            </span>
                            <span style={{ fontSize: '0.65rem', color: '#94A3B8' }}>
                              {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <p style={{ margin: 0, fontSize: '0.75rem', color: '#475569', lineHeight: '1.4' }}>
                            {n.message}
                          </p>
                        </div>
                      ))
                    )}
                  </div>

                  <div style={{ padding: '0.5rem', background: '#F8FAFC', borderTop: '1px solid #E2E8F0', textAlign: 'center' }}>
                    <button
                      onClick={() => {
                        setShowNotifMenu(false);
                        setActiveTab('notifications');
                      }}
                      style={{ background: 'none', border: 'none', color: '#1D4ED8', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}
                    >
                      View All Messages & Alerts &rarr;
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* =========================================================================
            TAB 1: OVERVIEW
           ========================================================================= */}
        {activeTab === 'overview' && (
          <div>
            {/* KPI Cards */}
            <div className="kpi-grid" style={{ marginBottom: '2rem' }}>
              {/* Customers KPI */}
              <div className="kpi-card" onClick={() => setActiveTab('customers')} style={{ cursor: 'pointer' }}>
                <div className="kpi-icon" style={{ background: '#EFF6FF', color: '#2563EB' }}>
                  <Users size={24} />
                </div>
                <div className="kpi-info">
                  <div className="kpi-value">{stats.customersCount}</div>
                  <div className="kpi-label">Registered Customers</div>
                </div>
              </div>

              {/* Approved Providers KPI */}
              <div className="kpi-card" onClick={() => setActiveTab('providers')} style={{ cursor: 'pointer' }}>
                <div className="kpi-icon" style={{ background: '#ECFDF5', color: '#059669' }}>
                  <ShieldCheck size={24} />
                </div>
                <div className="kpi-info">
                  <div className="kpi-value">{stats.approvedProvidersCount}</div>
                  <div className="kpi-label">Approved Providers</div>
                </div>
              </div>

              {/* Pending Applications KPI */}
              <div className="kpi-card" onClick={() => setActiveTab('verifications')} style={{ cursor: 'pointer', borderColor: stats.pendingVerificationsCount > 0 ? '#F59E0B' : undefined }}>
                <div className="kpi-icon" style={{ background: '#FEF3C7', color: '#D97706' }}>
                  <Clock size={24} />
                </div>
                <div className="kpi-info">
                  <div className="kpi-value">{stats.pendingVerificationsCount}</div>
                  <div className="kpi-label">Pending Provider Applications</div>
                </div>
              </div>

              {/* New Registrations KPI */}
              <div className="kpi-card">
                <div className="kpi-icon" style={{ background: '#F3E8FF', color: '#9333EA' }}>
                  <UserCheck size={24} />
                </div>
                <div className="kpi-info">
                  <div className="kpi-value">{stats.newRegistrationsCount}</div>
                  <div className="kpi-label">New Registrations (7 Days)</div>
                </div>
              </div>

              {/* Total Bookings KPI */}
              <div className="kpi-card" onClick={() => setActiveTab('bookings')} style={{ cursor: 'pointer' }}>
                <div className="kpi-icon" style={{ background: '#F0FDF4', color: '#16A34A' }}>
                  <Calendar size={24} />
                </div>
                <div className="kpi-info">
                  <div className="kpi-value">{stats.bookingsCount}</div>
                  <div className="kpi-label">Total Bookings & Jobs</div>
                </div>
              </div>

              {/* Gross Platform Volume */}
              <div className="kpi-card">
                <div className="kpi-icon" style={{ background: '#FFFBEB', color: '#B45309' }}>
                  <DollarSign size={24} />
                </div>
                <div className="kpi-info">
                  <div className="kpi-value">
                    LKR {(stats.grossVolumeLKR || 0).toLocaleString()}
                  </div>
                  <div className="kpi-label">Settled Job Volume</div>
                </div>
              </div>
            </div>

            {/* Payment & Subscription Enforcement Summary Row */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
              gap: '1rem',
              marginBottom: '2rem'
            }}>
              <div
                onClick={() => setActiveTab('verifications')}
                style={{
                  background: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  borderLeft: '4px solid #F59E0B',
                  borderRadius: '10px',
                  padding: '0.9rem 1.1rem',
                  cursor: 'pointer'
                }}
              >
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                  Awaiting Reg. Payment
                </div>
                <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#92400E', marginTop: '0.2rem' }}>
                  {stats.awaitingRegistrationPaymentCount || 0}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#78350F', marginTop: '0.15rem' }}>
                  Unpaid provider registrations
                </div>
              </div>

              <div
                onClick={() => setActiveTab('payments')}
                style={{
                  background: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  borderLeft: '4px solid #EA580C',
                  borderRadius: '10px',
                  padding: '0.9rem 1.1rem',
                  cursor: 'pointer'
                }}
              >
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                  Overdue Subscriptions
                </div>
                <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#C2410C', marginTop: '0.2rem' }}>
                  {stats.overdueSubscriptionsCount || 0}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#9A3412', marginTop: '0.15rem' }}>
                  Past Due (5-day grace) or Unpaid
                </div>
              </div>

              <div
                onClick={() => {
                  setProviderStatusFilter('suspended');
                  setActiveTab('providers');
                }}
                style={{
                  background: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  borderLeft: '4px solid #DC2626',
                  borderRadius: '10px',
                  padding: '0.9rem 1.1rem',
                  cursor: 'pointer'
                }}
              >
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                  Suspended Providers
                </div>
                <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#991B1B', marginTop: '0.2rem' }}>
                  {stats.suspendedProvidersCount || 0}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#B91C1C', marginTop: '0.15rem' }}>
                  Manual or Unpaid Subscription
                </div>
              </div>

              <div
                onClick={() => {
                  setBookingStatusFilter('awaiting_payment');
                  setActiveTab('bookings');
                }}
                style={{
                  background: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  borderLeft: '4px solid #2563EB',
                  borderRadius: '10px',
                  padding: '0.9rem 1.1rem',
                  cursor: 'pointer'
                }}
              >
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                  Unpaid Customer Bookings
                </div>
                <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#1E40AF', marginTop: '0.2rem' }}>
                  {stats.unpaidBookingsCount || 0}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#1D4ED8', marginTop: '0.15rem' }}>
                  Awaiting booking fee payment
                </div>
              </div>
            </div>

            {/* Quick Action Banner if Pending Verifications Exist */}
            {stats.pendingVerificationsCount > 0 && (
              <div style={{
                background: '#FEF3C7',
                border: '1px solid #F59E0B',
                borderRadius: '8px',
                padding: '1.25rem',
                marginBottom: '2rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '1rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <AlertCircle size={24} color="#B45309" />
                  <div>
                    <strong style={{ color: '#92400E', fontSize: '0.95rem' }}>
                      {stats.pendingVerificationsCount} Provider Application{stats.pendingVerificationsCount > 1 ? 's' : ''} Awaiting Administrator Review
                    </strong>
                    <div style={{ color: '#78350F', fontSize: '0.85rem' }}>
                      Review submitted NIC, credentials, and activate providers to allow customer hiring.
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setActiveTab('verifications')}
                  className="btn btn-primary btn-sm"
                  style={{ background: '#B45309', borderColor: '#B45309' }}
                >
                  Review Applications &rarr;
                </button>
              </div>
            )}

            {/* Overview Grid: Recent Registrations & Recent Bookings */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.5rem' }}>
              {/* Recent Customers card */}
              <div className="card">
                <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ fontSize: '1rem', color: '#0F172A', margin: 0, fontWeight: 700 }}>
                    Recent Customers
                  </h3>
                  <button onClick={() => setActiveTab('customers')} className="btn btn-secondary btn-sm" style={{ fontSize: '0.75rem' }}>
                    View All ({stats.customersCount})
                  </button>
                </div>
                <div style={{ padding: '0.75rem 1.25rem' }}>
                  {customers.length === 0 ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: '#94A3B8' }}>
                      No customers registered yet.
                    </div>
                  ) : (
                    customers.slice(0, 5).map(c => (
                      <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0', borderBottom: '1px solid #F1F5F9' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#0F172A' }}>{c.name}</div>
                          <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{c.email} &bull; {c.city || c.district}</div>
                        </div>
                        <button
                          onClick={() => {
                            setActiveTab('customers');
                            handleViewCustomerDetails(c.id);
                          }}
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                        >
                          Details
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Recent Bookings card */}
              <div className="card">
                <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ fontSize: '1rem', color: '#0F172A', margin: 0, fontWeight: 700 }}>
                    Recent Bookings
                  </h3>
                  <button onClick={() => setActiveTab('bookings')} className="btn btn-secondary btn-sm" style={{ fontSize: '0.75rem' }}>
                    View All ({stats.bookingsCount})
                  </button>
                </div>
                <div style={{ padding: '0.75rem 1.25rem' }}>
                  {bookings.length === 0 ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: '#94A3B8' }}>
                      No bookings created yet.
                    </div>
                  ) : (
                    bookings.slice(0, 5).map(b => (
                      <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0', borderBottom: '1px solid #F1F5F9' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#0F172A' }}>
                            #{b.booking_number} &bull; {b.service_title}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                            {b.customer_name} &rarr; {b.provider_name}
                          </div>
                        </div>
                        <span className={`badge badge-${b.status}`}>
                          {b.status.replace('_', ' ')}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 2: CUSTOMERS OVERVIEW
           ========================================================================= */}
        {activeTab === 'customers' && (
          <div>
            {/* Filter Bar + Add Customer Button */}
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ position: 'relative', flex: '1', minWidth: '240px' }}>
                <Search size={16} color="#94A3B8" style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="text"
                  placeholder="Search customer by name, email, phone, city..."
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  className="form-control"
                  style={{ paddingLeft: '2.25rem' }}
                />
              </div>

              <select
                value={customerStatusFilter}
                onChange={(e) => setCustomerStatusFilter(e.target.value)}
                className="form-control"
                style={{ width: 'auto', minWidth: '175px' }}
              >
                <option value="all">All Active &amp; Suspended</option>
                <option value="active">Active Only</option>
                <option value="suspended">Suspended Only</option>
                <option value="removed">Removed Accounts</option>
              </select>

              <button
                type="button"
                onClick={() => setAccountModal({ open: true, mode: 'add', role: 'customer', data: null })}
                className="btn btn-primary btn-sm"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 1rem' }}
              >
                <Plus size={15} />
                <span>Add Customer</span>
              </button>
            </div>

            {/* Customers Table */}
            <div className="card" style={{ overflow: 'visible' }}>
              <div className="table-responsive" style={{ overflow: 'visible' }}>
                <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', textAlign: 'left', fontSize: '0.8rem', color: '#64748B' }}>
                      <th style={{ padding: '0.75rem 1rem' }}>Customer</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Contact Details</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Location</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Registration Date</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Bookings History</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Account Status</th>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customers.length === 0 ? (
                      <tr>
                        <td colSpan="7" style={{ textAlign: 'center', padding: '3rem', color: '#94A3B8' }}>
                          <Users size={36} color="#CBD5E1" style={{ margin: '0 auto 0.5rem auto' }} />
                          <div>No customer accounts found matching your query.</div>
                        </td>
                      </tr>
                    ) : (
                      customers.map(c => (
                        <tr key={c.id} style={{ borderBottom: '1px solid #F1F5F9', fontSize: '0.875rem' }}>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                              <img
                                src={c.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100'}
                                alt={c.name}
                                style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover' }}
                              />
                              <div>
                                <div style={{ fontWeight: 700, color: '#0F172A' }}>{c.name}</div>
                                <div style={{ fontSize: '0.75rem', color: '#64748B' }}>ID: {c.id}</div>
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <div>{c.email}</div>
                            <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{c.phone || 'No phone'}</div>
                          </td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <div>{c.city || '—'}</div>
                            <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{c.district}</div>
                          </td>
                          <td style={{ padding: '0.75rem 1rem', color: '#64748B', fontSize: '0.8rem' }}>
                            {new Date(c.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                          </td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <div><strong>{c.total_bookings}</strong> total</div>
                            <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                              {c.active_bookings} active &bull; {c.completed_bookings} completed
                            </div>
                          </td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <span className={`badge ${
                              c.status === 'active'
                                ? 'badge-verified'
                                : c.status === 'removed'
                                ? 'badge-cancelled'
                                : 'badge-declined'
                            }`}>
                              {c.status.toUpperCase()}
                            </span>
                            {c.invitation_token && !c.invitation_accepted_at && (
                              <div style={{ fontSize: '0.7rem', color: '#D97706', marginTop: '0.2rem', fontWeight: 600 }}>
                                Invite Pending
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                            <AccountActionsMenu
                              account={c}
                              role="customer"
                              onViewDetails={() => handleViewCustomerDetails(c.id)}
                              onEditDetails={() => setAccountModal({ open: true, mode: 'edit', role: 'customer', data: c })}
                              onSuspendOrReactivate={() => handleToggleCustomerStatus(c)}
                              onRemoveAccount={() => setRemoveModal({ open: true, role: 'customer', account: c })}
                              onRestoreAccount={() => handleRestoreAccount(c, 'customer')}
                            />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 3: SERVICE PROVIDERS OVERVIEW
           ========================================================================= */}
        {activeTab === 'providers' && (
          <div>
            {/* Filter Bar + Add Service Provider Button */}
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ position: 'relative', flex: '1', minWidth: '240px' }}>
                <Search size={16} color="#94A3B8" style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="text"
                  placeholder="Search by provider name, confirmation ID, phone, district..."
                  value={providerSearch}
                  onChange={(e) => setProviderSearch(e.target.value)}
                  className="form-control"
                  style={{ paddingLeft: '2.25rem' }}
                />
              </div>

              <select
                value={providerVerifFilter}
                onChange={(e) => setProviderVerifFilter(e.target.value)}
                className="form-control"
                style={{ width: 'auto', minWidth: '160px' }}
              >
                <option value="all">All Approvals</option>
                <option value="approved">Approved</option>
                <option value="pending">Pending Review</option>
                <option value="changes_requested">Changes Requested</option>
                <option value="rejected">Rejected</option>
                <option value="suspended">Suspended</option>
              </select>

              <select
                value={providerStatusFilter}
                onChange={(e) => setProviderStatusFilter(e.target.value)}
                className="form-control"
                style={{ width: 'auto', minWidth: '175px' }}
              >
                <option value="all">All Active &amp; Suspended</option>
                <option value="active">Active Only</option>
                <option value="suspended">Suspended Only</option>
                <option value="removed">Removed Accounts</option>
              </select>

              <button
                type="button"
                onClick={() => setAccountModal({ open: true, mode: 'add', role: 'provider', data: null })}
                className="btn btn-primary btn-sm"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 1rem' }}
              >
                <Plus size={15} />
                <span>Add Service Provider</span>
              </button>
            </div>

            {/* Providers Table */}
            <div className="card" style={{ overflow: 'visible' }}>
              <div className="table-responsive" style={{ overflow: 'visible' }}>
                <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', textAlign: 'left', fontSize: '0.8rem', color: '#64748B' }}>
                      <th style={{ padding: '0.75rem 1rem' }}>Confirmation ID</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Provider Details</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Service Category</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Location</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Approval &amp; Account Status</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Jobs &amp; Rating</th>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {providers.length === 0 ? (
                      <tr>
                        <td colSpan="7" style={{ textAlign: 'center', padding: '3rem', color: '#94A3B8' }}>
                          <Briefcase size={36} color="#CBD5E1" style={{ margin: '0 auto 0.5rem auto' }} />
                          <div>No service providers match the current filters.</div>
                        </td>
                      </tr>
                    ) : (
                      providers.map(p => (
                        <tr key={p.id} style={{ borderBottom: '1px solid #F1F5F9', fontSize: '0.875rem' }}>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <span style={{
                              fontFamily: 'monospace',
                              fontWeight: 700,
                              fontSize: '0.8rem',
                              background: '#F1F5F9',
                              padding: '0.2rem 0.5rem',
                              borderRadius: '4px',
                              color: '#1E40AF',
                              border: '1px solid #CBD5E1'
                            }}>
                              {p.confirmation_id || '—'}
                            </span>
                          </td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                              <img
                                src={p.avatar || 'https://images.unsplash.com/photo-1544717305-2782549b5136?w=100'}
                                alt={p.name}
                                style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover' }}
                              />
                              <div>
                                <div style={{ fontWeight: 700, color: '#0F172A' }}>{p.name}</div>
                                <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{p.email} &bull; {p.phone || 'No phone'}</div>
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <div style={{ fontWeight: 600 }}>{p.category_name || 'General'}</div>
                            <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{p.title}</div>
                          </td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <div>{p.city || p.district}</div>
                            <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{p.district}</div>
                          </td>
                           <td style={{ padding: '0.75rem 1rem' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', alignItems: 'flex-start' }}>
                              {/* 1. Approval Status */}
                              <span className={`badge ${
                                p.verification_status === 'approved'
                                  ? 'badge-verified'
                                  : !p.registration_fee_paid && p.verification_status === 'pending'
                                  ? 'badge-pending'
                                  : p.verification_status === 'changes_requested'
                                  ? 'badge-declined'
                                  : p.verification_status === 'pending'
                                  ? 'badge-pending'
                                  : 'badge-declined'
                              }`}>
                                {!p.registration_fee_paid && p.verification_status === 'pending'
                                  ? 'Awaiting Registration Payment'
                                  : p.verification_status === 'pending'
                                  ? 'Pending Admin Approval'
                                  : p.verification_status.replace('_', ' ').toUpperCase()}
                              </span>

                              {/* 2. Account Access Status */}
                              <span style={{
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                color: p.user_status === 'active'
                                  ? '#16A34A'
                                  : p.user_status === 'removed'
                                  ? '#64748B'
                                  : '#DC2626'
                              }}>
                                {p.user_status === 'removed'
                                  ? 'Access: REMOVED'
                                  : p.manual_suspended === 1 || p.suspension_type === 'manual'
                                  ? 'Access: Manual Suspension'
                                  : p.subscription_suspended === 1 || p.suspension_type === 'subscription_unpaid' || p.subscription_status === 'suspended_unpaid'
                                  ? 'Access: Suspended — Unpaid Subscription'
                                  : p.user_status === 'suspended'
                                  ? 'Access: SUSPENDED'
                                  : 'Access: ACTIVE'}
                              </span>

                              {/* 3. Registration Fee & Monthly Subscription Status */}
                              <div style={{ fontSize: '0.7rem', color: '#475569', display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                                <span style={{
                                  background: p.registration_fee_paid ? '#F0FDF4' : '#FEF3C7',
                                  color: p.registration_fee_paid ? '#15803D' : '#92400E',
                                  padding: '0.1rem 0.4rem',
                                  borderRadius: '4px',
                                  fontWeight: 600
                                }}>
                                  Reg Fee: {p.registration_fee_paid ? 'Paid' : 'Unpaid'}
                                </span>
                                <span style={{
                                  background: p.subscription_status === 'active'
                                    ? '#ECFDF5'
                                    : p.subscription_status === 'past_due'
                                    ? '#FFFBEB'
                                    : p.subscription_status === 'suspended_unpaid'
                                    ? '#FEF2F2'
                                    : '#F1F5F9',
                                  color: p.subscription_status === 'active'
                                    ? '#047857'
                                    : p.subscription_status === 'past_due'
                                    ? '#B45309'
                                    : p.subscription_status === 'suspended_unpaid'
                                    ? '#B91C1C'
                                    : '#475569',
                                  padding: '0.1rem 0.4rem',
                                  borderRadius: '4px',
                                  fontWeight: 600
                                }}>
                                  Sub: {p.subscription_status === 'active'
                                    ? 'Active'
                                    : p.subscription_status === 'past_due'
                                    ? `Past Due (Grace until ${formatSriLankaDateTime(p.grace_period_end, false)})`
                                    : p.subscription_status === 'suspended_unpaid'
                                    ? 'Suspended — Unpaid'
                                    : 'Pending 1st Payment'}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                              <Star size={13} fill="#F59E0B" color="#F59E0B" />
                              <strong>{p.rating_avg > 0 ? p.rating_avg.toFixed(1) : 'New'}</strong>
                              <span style={{ fontSize: '0.75rem', color: '#64748B' }}>({p.review_count})</span>
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                              {p.completed_jobs || 0} completed jobs
                            </div>
                          </td>
                          <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center' }}>
                              {p.verification_status !== 'approved' && p.user_status !== 'removed' && (
                                <button
                                  onClick={() => {
                                    setReviewModalProvider(p);
                                    setDecisionAction(p.registration_fee_paid ? 'approved' : 'request_changes');
                                    setDecisionNotes('');
                                  }}
                                  className="btn btn-primary btn-sm"
                                  style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
                                >
                                  Review
                                </button>
                              )}

                              <AccountActionsMenu
                                account={p}
                                role="provider"
                                onViewDetails={() => handleViewProviderDetails(p.id)}
                                onEditDetails={() => setAccountModal({ open: true, mode: 'edit', role: 'provider', data: p })}
                                onSuspendOrReactivate={() => handleToggleProviderStatus(p)}
                                onRemoveAccount={() => setRemoveModal({ open: true, role: 'provider', account: p })}
                                onRestoreAccount={() => handleRestoreAccount(p, 'provider')}
                              />
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 4: PENDING APPROVALS
           ========================================================================= */}
        {activeTab === 'verifications' && (
          <div>
            <div style={{ marginBottom: '1.25rem' }}>
              <p style={{ color: '#64748B', margin: 0, fontSize: '0.9rem' }}>
                Review service provider registrations and verification documents. Only approved, active providers can receive booking requests or appear in public search.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {verifications.length === 0 ? (
                <div className="card" style={{ padding: '3.5rem 1.5rem', textAlign: 'center' }}>
                  <ShieldCheck size={48} color="#10B981" style={{ margin: '0 auto 0.75rem auto' }} />
                  <h3 style={{ fontSize: '1.2rem', color: '#0F172A', marginBottom: '0.3rem' }}>
                    All provider applications reviewed!
                  </h3>
                  <p style={{ color: '#64748B', fontSize: '0.875rem' }}>
                    No pending applications currently in queue.
                  </p>
                </div>
              ) : (
                verifications.map(v => (
                  <div key={v.id} className="card" style={{ padding: '1.5rem', borderLeft: v.verification_status === 'pending' ? '4px solid #F59E0B' : v.verification_status === 'changes_requested' ? '4px solid #EA580C' : '4px solid #10B981' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
                      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        <img
                          src={v.avatar || 'https://images.unsplash.com/photo-1544717305-2782549b5136?w=120'}
                          alt={v.name}
                          style={{ width: '56px', height: '56px', borderRadius: '50%', objectFit: 'cover' }}
                        />
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <h3 style={{ fontSize: '1.15rem', color: '#0F172A', margin: 0 }}>
                              {v.name}
                            </h3>
                            <span style={{
                              fontFamily: 'monospace',
                              fontWeight: 700,
                              fontSize: '0.8rem',
                              background: '#F1F5F9',
                              padding: '0.15rem 0.5rem',
                              borderRadius: '4px',
                              color: '#1E40AF',
                              border: '1px solid #CBD5E1'
                            }}>
                              {v.confirmation_id || 'ID Pending'}
                            </span>
                            <span className={`badge ${
                              v.verification_status === 'approved'
                                ? 'badge-verified'
                                : v.verification_status === 'changes_requested'
                                ? 'badge-declined'
                                : 'badge-pending'
                            }`}>
                              {!v.registration_fee_paid && v.verification_status === 'pending'
                                ? 'Awaiting Registration Payment'
                                : v.verification_status === 'pending'
                                ? 'Pending Admin Approval'
                                : v.verification_status.replace('_', ' ').toUpperCase()}
                            </span>
                            <span style={{
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              padding: '0.15rem 0.55rem',
                              borderRadius: '999px',
                              background: v.registration_fee_paid ? '#ECFDF5' : '#FEF2F2',
                              color: v.registration_fee_paid ? '#047857' : '#B91C1C',
                              border: `1px solid ${v.registration_fee_paid ? '#A7F3D0' : '#FECACA'}`
                            }}>
                              {v.registration_fee_paid ? '✓ Registration Fee Verified' : '✕ Registration Fee Unpaid'}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.85rem', color: '#64748B', marginTop: '0.2rem' }}>
                            {v.category_name} &bull; {v.title} &bull; {v.city || v.district} ({v.district})
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        <button
                          onClick={() => {
                            if (!v.registration_fee_paid) return;
                            setReviewModalProvider(v);
                            setDecisionAction('approved');
                            setDecisionNotes('');
                          }}
                          disabled={!v.registration_fee_paid}
                          title={!v.registration_fee_paid ? 'Provider must complete and verify their Registration Fee payment before approval' : 'Approve provider'}
                          className="btn btn-primary btn-sm"
                          style={{
                            background: v.registration_fee_paid ? '#10B981' : '#94A3B8',
                            borderColor: v.registration_fee_paid ? '#10B981' : '#94A3B8',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            cursor: v.registration_fee_paid ? 'pointer' : 'not-allowed',
                            opacity: v.registration_fee_paid ? 1 : 0.65
                          }}
                        >
                          <Check size={14} />
                          <span>{v.registration_fee_paid ? 'Approve' : 'Approve (Locked — Unpaid)'}</span>
                        </button>

                        <button
                          onClick={() => {
                            setReviewModalProvider(v);
                            setDecisionAction('request_changes');
                            setDecisionNotes(v.decision_reason || '');
                          }}
                          className="btn btn-secondary btn-sm"
                          style={{ borderColor: '#EA580C', color: '#EA580C', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                        >
                          <AlertTriangle size={14} />
                          <span>Request Changes</span>
                        </button>

                        <button
                          onClick={() => {
                            setReviewModalProvider(v);
                            setDecisionAction('rejected');
                            setDecisionNotes('');
                          }}
                          className="btn btn-secondary btn-sm"
                          style={{ borderColor: '#EF4444', color: '#EF4444', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                        >
                          <X size={14} />
                          <span>Reject</span>
                        </button>
                      </div>
                    </div>

                    {/* Submitted documents & Profile Details */}
                    <div style={{ background: '#F8FAFC', borderRadius: '8px', padding: '1rem', border: '1px solid #E2E8F0', marginTop: '0.75rem' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '0.75rem' }}>
                        <div>
                          <div style={{ fontSize: '0.75rem', color: '#64748B', textTransform: 'uppercase', fontWeight: 700 }}>Contact</div>
                          <div style={{ fontSize: '0.875rem', color: '#0F172A' }}>{v.email}</div>
                          <div style={{ fontSize: '0.875rem', color: '#0F172A' }}>{v.phone || 'No phone'}</div>
                        </div>

                        <div>
                          <div style={{ fontSize: '0.75rem', color: '#64748B', textTransform: 'uppercase', fontWeight: 700 }}>Experience & Rates</div>
                          <div style={{ fontSize: '0.875rem', color: '#0F172A' }}>{v.experience_years} years experience</div>
                          <div style={{ fontSize: '0.875rem', color: '#0F172A' }}>{v.pricing_type} &bull; LKR {v.base_rate}</div>
                        </div>

                        <div>
                          <div style={{ fontSize: '0.75rem', color: '#64748B', textTransform: 'uppercase', fontWeight: 700 }}>Registered On</div>
                          <div style={{ fontSize: '0.875rem', color: '#0F172A' }}>
                            {new Date(v.created_at).toLocaleString()}
                          </div>
                        </div>
                      </div>

                      {/* Submitted verification documents */}
                      <div style={{ marginTop: '0.5rem', borderTop: '1px solid #E2E8F0', paddingTop: '0.75rem' }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0F172A', marginBottom: '0.5rem' }}>
                          Submitted Verification Documents:
                        </div>
                        {Array.isArray(v.verification_documents) && v.verification_documents.length > 0 ? (
                          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            {v.verification_documents.map((doc, idx) => (
                              <div
                                key={idx}
                                style={{
                                  background: '#FFFFFF',
                                  border: '1px solid #CBD5E1',
                                  borderRadius: '6px',
                                  padding: '0.4rem 0.75rem',
                                  fontSize: '0.8rem',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.4rem'
                                }}
                              >
                                <FileText size={14} color="#64748B" />
                                <span><strong>{doc.type || 'Document'}:</strong> {doc.number || doc.name || 'Submitted'}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ fontSize: '0.8rem', color: '#94A3B8' }}>
                            No verification documents attached.
                          </div>
                        )}
                      </div>

                      {/* Audit Trail: Decision notes / history if available */}
                      {v.decision_reason && (
                        <div style={{ marginTop: '0.75rem', padding: '0.5rem 0.75rem', background: '#FFF7ED', border: '1px solid #FFEDD5', borderRadius: '6px', fontSize: '0.8rem' }}>
                          <span style={{ fontWeight: 700, color: '#C2410C' }}>Last Admin Decision Note:</span> {v.decision_reason}
                          {v.reviewer_name && <span style={{ color: '#9A3412', marginLeft: '0.5rem' }}>(by {v.reviewer_name} on {new Date(v.reviewed_at).toLocaleDateString()})</span>}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 5: BOOKINGS & HIRING VISIBILITY
           ========================================================================= */}
        {activeTab === 'bookings' && (
          <div>
            {/* Filter Bar */}
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ position: 'relative', flex: '1', minWidth: '220px' }}>
                <Search size={16} color="#94A3B8" style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="text"
                  placeholder="Search by booking #, service, customer or provider name..."
                  value={bookingSearch}
                  onChange={(e) => setBookingSearch(e.target.value)}
                  className="form-control"
                  style={{ paddingLeft: '2.25rem' }}
                />
              </div>

              {/* Status filter */}
              <select
                value={bookingStatusFilter}
                onChange={(e) => setBookingStatusFilter(e.target.value)}
                className="form-control"
                style={{ width: 'auto', minWidth: '160px' }}
              >
                <option value="all">All Booking Statuses</option>
                <option value="awaiting_payment">Awaiting Booking Fee Payment</option>
                <option value="pending">Pending Provider Acceptance</option>
                <option value="awaiting_quote_approval">Awaiting Customer Quote Approval</option>
                <option value="confirmed">Confirmed Hire</option>
                <option value="in_progress">In Progress</option>
                <option value="awaiting_completion">Awaiting Completion</option>
                <option value="completed">Completed</option>
                <option value="declined">Declined</option>
                <option value="cancelled">Cancelled</option>
              </select>

              {/* Payment filter */}
              <select
                value={bookingPaymentFilter}
                onChange={(e) => setBookingPaymentFilter(e.target.value)}
                className="form-control"
                style={{ width: 'auto', minWidth: '150px' }}
              >
                <option value="all">All Payment Statuses</option>
                <option value="unpaid">Unpaid</option>
                <option value="paid_direct">Paid Direct</option>
                <option value="waived">Waived</option>
                <option value="refunded">Refunded</option>
              </select>

              {/* Date Filter */}
              <input
                type="date"
                value={bookingDateFilter}
                onChange={(e) => setBookingDateFilter(e.target.value)}
                className="form-control"
                style={{ width: 'auto' }}
              />
            </div>

            {/* Bookings Table */}
            <div className="card" style={{ overflow: 'hidden' }}>
              <div className="table-responsive">
                <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', textAlign: 'left', fontSize: '0.8rem', color: '#64748B' }}>
                      <th style={{ padding: '0.75rem 1rem' }}>Booking #</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Customer</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Service Provider</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Service Details</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Schedule</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Price / Quote</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Booking Status</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Payment</th>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bookings.length === 0 ? (
                      <tr>
                        <td colSpan="9" style={{ textAlign: 'center', padding: '3.5rem', color: '#94A3B8' }}>
                          <Calendar size={36} color="#CBD5E1" style={{ margin: '0 auto 0.5rem auto' }} />
                          <div>No booking requests or hires found matching your filters.</div>
                        </td>
                      </tr>
                    ) : (
                      bookings.map(b => (
                        <tr key={b.id} style={{ borderBottom: '1px solid #F1F5F9', fontSize: '0.875rem' }}>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <span style={{ fontWeight: 700, color: '#1E40AF', fontFamily: 'monospace' }}>
                              #{b.booking_number}
                            </span>
                          </td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <div style={{ fontWeight: 600, color: '#0F172A' }}>{b.customer_name}</div>
                            <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{b.customer_phone || b.customer_email}</div>
                          </td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <div style={{ fontWeight: 600, color: '#0F172A' }}>{b.provider_name}</div>
                            <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{b.provider_confirmation_id || 'Provider'}</div>
                          </td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <div style={{ fontWeight: 600 }}>{b.service_title}</div>
                            <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{b.service_category}</div>
                          </td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <div>{b.scheduled_date}</div>
                            <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{b.scheduled_time_slot}</div>
                          </td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <div style={{ fontWeight: 700 }}>
                              {b.final_amount > 0 ? `LKR ${b.final_amount.toLocaleString()}` : 'Awaiting Quote'}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: '#64748B' }}>
                              {b.pricing_type}
                            </div>
                          </td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <span className={`badge badge-${b.status}`}>
                              {b.status === 'awaiting_payment'
                                ? 'Awaiting Booking Fee Payment'
                                : b.status === 'pending'
                                ? 'Pending Provider Acceptance'
                                : b.status === 'confirmed'
                                ? 'Confirmed Hire'
                                : b.status.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', alignItems: 'flex-start' }}>
                              <span style={{
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                padding: '0.15rem 0.45rem',
                                borderRadius: '4px',
                                background: b.booking_fee_status === 'paid' ? '#ECFDF5' : '#FEF2F2',
                                color: b.booking_fee_status === 'paid' ? '#047857' : '#B91C1C'
                              }}>
                                Booking Fee: {b.booking_fee_status === 'paid' ? 'PAID' : 'UNPAID'}
                              </span>
                              <span style={{ fontSize: '0.7rem', color: '#64748B' }}>
                                Job: {b.payment_status.replace(/_/g, ' ').toUpperCase()}
                              </span>
                            </div>
                          </td>
                          <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                            <button
                              onClick={() => setSelectedBooking(b)}
                              className="btn btn-secondary btn-sm"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                            >
                              <Eye size={13} />
                              <span>Details</span>
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 6: MESSAGES & NOTIFICATIONS
           ========================================================================= */}
        {activeTab === 'notifications' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <p style={{ color: '#64748B', margin: 0, fontSize: '0.9rem' }}>
                  Persistent system notifications and new registration alerts for platform administrators ({notifications.length} total, {unreadCount} unread).
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={handleMarkAllNotificationsRead}
                    className="btn btn-secondary btn-sm"
                    style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                  >
                    <CheckCheck size={14} />
                    <span>Mark All as Read</span>
                  </button>
                )}
              </div>
            </div>

            {notifDeleteError && (
              <div
                role="alert"
                style={{
                  background: '#FEF2F2',
                  border: '1px solid #FECACA',
                  borderRadius: '8px',
                  padding: '0.75rem 1rem',
                  marginBottom: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                  color: '#991B1B',
                  fontSize: '0.85rem'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <AlertCircle size={16} color="#DC2626" style={{ flexShrink: 0 }} />
                  <span>{notifDeleteError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setNotifDeleteError('')}
                  aria-label="Dismiss error"
                  style={{ background: 'none', border: 'none', color: '#991B1B', cursor: 'pointer', padding: '0.2rem' }}
                >
                  <X size={16} />
                </button>
              </div>
            )}

            <div className="card" style={{ overflow: 'hidden' }}>
              {/* Selection & Bulk Action Toolbar above the list */}
              {notifications.length > 0 && (
                <div
                  style={{
                    padding: '0.85rem 1.25rem',
                    background: '#F8FAFC',
                    borderBottom: '1px solid #E2E8F0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '0.75rem'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
                    <label
                      htmlFor="select-all-notifications"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        color: '#334155',
                        userSelect: 'none',
                        margin: 0
                      }}
                    >
                      <input
                        id="select-all-notifications"
                        type="checkbox"
                        checked={allCurrentPageSelected}
                        ref={(el) => {
                          if (el) {
                            el.indeterminate = someCurrentPageSelected && !allCurrentPageSelected;
                          }
                        }}
                        onChange={handleToggleSelectAllCurrentPage}
                        aria-label="Select all notifications on the current page"
                        style={{
                          width: '16px',
                          height: '16px',
                          cursor: 'pointer',
                          accentColor: '#334155'
                        }}
                      />
                      <span>Select All</span>
                    </label>

                    <span
                      aria-live="polite"
                      style={{
                        fontSize: '0.85rem',
                        fontWeight: selectedNotifIds.length > 0 ? 700 : 500,
                        color: selectedNotifIds.length > 0 ? '#0F172A' : '#64748B',
                        paddingLeft: '0.75rem',
                        borderLeft: '1px solid #CBD5E1'
                      }}
                    >
                      {selectedNotifIds.length > 0
                        ? `${selectedNotifIds.length} notification${selectedNotifIds.length === 1 ? '' : 's'} selected.`
                        : `Showing ${currentPageNotifications.length} of ${notifications.length} notification${notifications.length === 1 ? '' : 's'}`}
                    </span>
                  </div>

                  {selectedNotifIds.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={handleClearNotifSelection}
                        disabled={deletingNotifs}
                        className="btn btn-secondary btn-sm"
                        style={{
                          background: '#FFFFFF',
                          borderColor: '#CBD5E1',
                          color: '#334155',
                          fontSize: '0.8rem',
                          padding: '0.35rem 0.75rem'
                        }}
                      >
                        Clear Selection
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenDeleteNotifModal(selectedNotifIds, 'bulk')}
                        disabled={deletingNotifs}
                        className="btn btn-sm"
                        style={{
                          background: '#DC2626',
                          borderColor: '#DC2626',
                          color: '#FFFFFF',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          padding: '0.35rem 0.8rem',
                          borderRadius: '6px',
                          cursor: deletingNotifs ? 'not-allowed' : 'pointer',
                          opacity: deletingNotifs ? 0.65 : 1
                        }}
                      >
                        <Trash2 size={14} />
                        <span>Delete Selected ({selectedNotifIds.length})</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {notifications.length === 0 ? (
                <div style={{ padding: '3.5rem 1.5rem', textAlign: 'center', color: '#94A3B8' }}>
                  <Bell size={40} color="#CBD5E1" style={{ margin: '0 auto 0.75rem auto' }} />
                  <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#64748B' }}>
                    No notifications to display.
                  </div>
                </div>
              ) : (
                <>
                  {currentPageNotifications.map((n) => {
                    const isSelected = selectedNotifIds.includes(n.id);
                    const checkboxId = `notif-select-${n.id}`;
                    return (
                      <div
                        key={n.id}
                        style={{
                          padding: '1rem 1.25rem',
                          borderBottom: '1px solid #F1F5F9',
                          background: isSelected
                            ? '#F1F5F9'
                            : n.is_read
                            ? '#FFFFFF'
                            : '#F0F9FF',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: '0.75rem',
                          transition: 'background 0.15s ease'
                        }}
                      >
                        <div style={{ display: 'flex', gap: '0.85rem', alignItems: 'flex-start', flex: '1', minWidth: '240px' }}>
                          {/* Checkbox beside each notification — clicking must not open the notification */}
                          <div
                            onClick={(e) => e.stopPropagation()}
                            style={{ paddingTop: '0.45rem', display: 'flex', alignItems: 'center', flexShrink: 0 }}
                          >
                            <input
                              id={checkboxId}
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => handleToggleSelectNotif(n.id, e)}
                              onClick={(e) => e.stopPropagation()}
                              aria-label={`Select notification: ${n.title}`}
                              style={{
                                width: '16px',
                                height: '16px',
                                cursor: 'pointer',
                                accentColor: '#334155'
                              }}
                            />
                          </div>

                          <div
                            style={{
                              width: '36px',
                              height: '36px',
                              borderRadius: '50%',
                              background: n.is_read ? '#F1F5F9' : '#DBEAFE',
                              color: n.is_read ? '#64748B' : '#1D4ED8',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0
                            }}
                          >
                            <Bell size={18} />
                          </div>

                          <div style={{ flex: '1', minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                              <button
                                type="button"
                                onClick={() => handleOpenNotificationTarget(n)}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  padding: 0,
                                  margin: 0,
                                  fontSize: '0.95rem',
                                  fontWeight: 700,
                                  color: '#0F172A',
                                  cursor: 'pointer',
                                  textAlign: 'left'
                                }}
                              >
                                {n.title}
                              </button>
                              {!n.is_read && (
                                <span className="badge" style={{ background: '#EF4444', color: '#fff', fontSize: '0.65rem' }}>
                                  UNREAD
                                </span>
                              )}
                            </div>
                            <p style={{ margin: '0.25rem 0', color: '#334155', fontSize: '0.875rem', wordBreak: 'break-word' }}>
                              {n.message}
                            </p>
                            <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>
                              {new Date(n.created_at).toLocaleString()}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', marginLeft: 'auto' }}>
                          {n.title?.toLowerCase().includes('provider') && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!n.is_read) markNotificationRead(n.id);
                                setActiveTab('verifications');
                              }}
                              className="btn btn-primary btn-sm"
                            >
                              Review Application &rarr;
                            </button>
                          )}

                          {!n.is_read && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                markNotificationRead(n.id);
                              }}
                              className="btn btn-secondary btn-sm"
                            >
                              Mark as Read
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={(e) => handleOpenDeleteNotifModal([n.id], 'single', e)}
                            disabled={deletingNotifs}
                            aria-label={`Delete notification: ${n.title}`}
                            title="Delete notification from your inbox"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '32px',
                              height: '32px',
                              borderRadius: '6px',
                              border: '1px solid #FECACA',
                              background: '#FEF2F2',
                              color: '#DC2626',
                              cursor: deletingNotifs ? 'not-allowed' : 'pointer',
                              flexShrink: 0,
                              transition: 'background 0.15s ease'
                            }}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {/* Pagination Footer if more than 1 page */}
                  {totalNotifPages > 1 && (
                    <div
                      style={{
                        padding: '0.75rem 1.25rem',
                        background: '#F8FAFC',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '0.75rem',
                        fontSize: '0.82rem',
                        color: '#475569'
                      }}
                    >
                      <span>
                        Page <strong>{safeNotifPage}</strong> of <strong>{totalNotifPages}</strong>
                      </span>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button
                          type="button"
                          onClick={() => setNotifPage((p) => Math.max(1, p - 1))}
                          disabled={safeNotifPage <= 1}
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '0.3rem 0.65rem', fontSize: '0.78rem' }}
                        >
                          Previous
                        </button>
                        <button
                          type="button"
                          onClick={() => setNotifPage((p) => Math.min(totalNotifPages, p + 1))}
                          disabled={safeNotifPage >= totalNotifPages}
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '0.3rem 0.65rem', fontSize: '0.78rem' }}
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 7: SETTINGS
           ========================================================================= */}
        {activeTab === 'settings' && (
          <div style={{ maxWidth: '680px' }}>
            <div className="card" style={{ padding: '2rem' }}>
              <h2 style={{ fontSize: '1.25rem', color: '#0F172A', marginBottom: '0.5rem' }}>
                Platform Fee & Commission Configuration
              </h2>
              <p style={{ color: '#64748B', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
                Adjust platform commission rates, verified provider registration fees, and sponsored badges.
              </p>

              {settingsSaved && (
                <div style={{
                  background: '#ECFDF5',
                  border: '1px solid #6EE7B7',
                  borderRadius: '6px',
                  padding: '0.75rem 1rem',
                  marginBottom: '1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  color: '#065F46',
                  fontSize: '0.875rem'
                }}>
                  <CheckCircle2 size={16} />
                  <span>Platform settings saved successfully to persistent database.</span>
                </div>
              )}

              <form onSubmit={handleSaveSettings}>
                <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                  <label className="form-label" htmlFor="commRate">
                    Standard Booking Commission Rate (Decimal, e.g. 0.10 = 10%)
                  </label>
                  <input
                    id="commRate"
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    value={commissionRate}
                    onChange={(e) => setCommissionRate(e.target.value)}
                    className="form-control"
                  />
                  <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '0.25rem' }}>
                    Calculated automatically and recorded into the financial accounting ledger upon job completion.
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                  <label className="form-label" htmlFor="regFee">
                    One-Time Provider Verification Fee (LKR)
                  </label>
                  <input
                    id="regFee"
                    type="number"
                    min="0"
                    value={registrationFee}
                    onChange={(e) => setRegistrationFee(e.target.value)}
                    className="form-control"
                  />
                </div>

                <div className="form-group" style={{ marginBottom: '1.75rem' }}>
                  <label className="form-label" htmlFor="sponsFee">
                    Monthly Featured Spotlight Fee (LKR)
                  </label>
                  <input
                    id="sponsFee"
                    type="number"
                    min="0"
                    value={sponsoredFee}
                    onChange={(e) => setSponsoredFee(e.target.value)}
                    className="form-control"
                  />
                </div>

                <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%' }}>
                  Save Platform Settings
                </button>
              </form>
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 8: CATEGORIES
           ========================================================================= */}
        {activeTab === 'categories' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
              {categoriesList.map(c => (
                <div key={c.id} className="card" style={{ padding: '1.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Tag size={18} />
                    </div>
                    <div>
                      <strong style={{ fontSize: '1rem', color: '#0F172A' }}>{c.name}</strong>
                      <div style={{ fontSize: '0.75rem', color: '#64748B' }}>slug: {c.slug}</div>
                    </div>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: '#475569', margin: 0 }}>
                    {c.description || 'Service Category'}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 9: REVIEWS MODERATION
           ========================================================================= */}
        {activeTab === 'reviews' && (
          <div>
            <div className="card" style={{ overflow: 'hidden' }}>
              <div className="table-responsive">
                <table className="table" style={{ width: '100%' }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', fontSize: '0.8rem', color: '#64748B', textAlign: 'left' }}>
                      <th style={{ padding: '0.75rem 1rem' }}>Customer</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Provider</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Rating</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Review Text</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reviewsList.length === 0 ? (
                      <tr>
                        <td colSpan="5" style={{ padding: '3rem', textAlign: 'center', color: '#94A3B8' }}>
                          No reviews submitted yet.
                        </td>
                      </tr>
                    ) : (
                      reviewsList.map(r => (
                        <tr key={r.id} style={{ borderBottom: '1px solid #F1F5F9', fontSize: '0.875rem' }}>
                          <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>{r.customer_name}</td>
                          <td style={{ padding: '0.75rem 1rem' }}>{r.provider_name}</td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                              <Star size={14} fill="#F59E0B" color="#F59E0B" />
                              <strong>{r.rating}</strong>/5
                            </div>
                          </td>
                          <td style={{ padding: '0.75rem 1rem', maxWidth: '300px' }}>
                            <div style={{ fontSize: '0.85rem', color: '#334155' }}>{r.review_text}</div>
                          </td>
                          <td style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', color: '#64748B' }}>
                            {new Date(r.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 10: PROMOTIONS & ADS
           ========================================================================= */}
        {activeTab === 'promotions' && (
          <div>
            <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1.1rem', marginBottom: '0.75rem', color: '#0F172A' }}>
                Create Banner Promotion
              </h3>
              <form onSubmit={async (e) => {
                e.preventDefault();
                try {
                  const res = await fetch('/api/admin/promotions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({
                      action: 'create_ad',
                      title: newAdTitle,
                      bannerText: newAdBannerText,
                      linkUrl: newAdLinkUrl || '/find',
                      placement: 'home_hero'
                    })
                  });
                  if (res.ok) {
                    setNewAdTitle('');
                    setNewAdBannerText('');
                    setNewAdLinkUrl('');
                    loadAdminData();
                  }
                } catch (err) {
                  alert('Failed to create ad.');
                }
              }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                  <input
                    type="text"
                    placeholder="Ad Title"
                    value={newAdTitle}
                    onChange={(e) => setNewAdTitle(e.target.value)}
                    className="form-control"
                    required
                  />
                  <input
                    type="text"
                    placeholder="Banner Tagline / Text"
                    value={newAdBannerText}
                    onChange={(e) => setNewAdBannerText(e.target.value)}
                    className="form-control"
                    required
                  />
                  <input
                    type="text"
                    placeholder="Destination URL (e.g. /find)"
                    value={newAdLinkUrl}
                    onChange={(e) => setNewAdLinkUrl(e.target.value)}
                    className="form-control"
                  />
                </div>
                <button type="submit" className="btn btn-primary btn-sm">
                  Publish Promotion
                </button>
              </form>
            </div>
          </div>
        )}

        {/* =====================================================================
            TAB: PAYMENTS & SUBSCRIPTIONS
           ===================================================================== */}
        {activeTab === 'payments' && (
          <AdminPaymentsSection token={token} notifications={notifications} />
        )}
      </main>

      {/* =========================================================================
          MODAL 1: CUSTOMER DETAILS (ADMINISTRATOR-ONLY VIEW)
         ========================================================================= */}
      {selectedCustomer && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
          backdropFilter: 'blur(3px)'
        }}>
          <div className="card" style={{ width: '100%', maxWidth: '780px', maxHeight: '90vh', overflowY: 'auto', padding: '2rem', position: 'relative' }}>
            <button
              onClick={() => setSelectedCustomer(null)}
              style={{ position: 'absolute', right: '1.25rem', top: '1.25rem', background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}
            >
              <X size={20} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', borderBottom: '1px solid #E2E8F0', paddingBottom: '1rem' }}>
              <img
                src={selectedCustomer.customer.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100'}
                alt={selectedCustomer.customer.name}
                style={{ width: '56px', height: '56px', borderRadius: '50%', objectFit: 'cover' }}
              />
              <div>
                <h2 style={{ fontSize: '1.3rem', color: '#0F172A', margin: 0 }}>
                  {selectedCustomer.customer.name}
                </h2>
                <div style={{ fontSize: '0.85rem', color: '#64748B' }}>
                  Customer ID: {selectedCustomer.customer.id} &bull; Registered {new Date(selectedCustomer.customer.created_at).toLocaleDateString()}
                </div>
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  onClick={() => setAccountModal({ open: true, mode: 'edit', role: 'customer', data: selectedCustomer.customer })}
                  className="btn btn-secondary btn-sm"
                >
                  Edit Details
                </button>
                {selectedCustomer.customer.status !== 'removed' ? (
                  <>
                    <button
                      onClick={() => handleToggleCustomerStatus(selectedCustomer.customer)}
                      className={`btn btn-sm ${selectedCustomer.customer.status === 'active' ? 'btn-danger' : 'btn-primary'}`}
                    >
                      {selectedCustomer.customer.status === 'active' ? 'Suspend Account' : 'Reactivate Account'}
                    </button>
                    <button
                      onClick={() => setRemoveModal({ open: true, role: 'customer', account: selectedCustomer.customer })}
                      className="btn btn-danger btn-sm"
                    >
                      Remove Account
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => handleRestoreAccount(selectedCustomer.customer, 'customer')}
                    className="btn btn-primary btn-sm"
                  >
                    Restore Account
                  </button>
                )}
              </div>
            </div>

            {/* Customer Details Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem', background: '#F8FAFC', padding: '1rem', borderRadius: '8px' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Email</div>
                <div style={{ fontSize: '0.9rem', color: '#0F172A', fontWeight: 600 }}>{selectedCustomer.customer.email}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Phone</div>
                <div style={{ fontSize: '0.9rem', color: '#0F172A', fontWeight: 600 }}>{selectedCustomer.customer.phone || 'None provided'}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Location</div>
                <div style={{ fontSize: '0.9rem', color: '#0F172A', fontWeight: 600 }}>{selectedCustomer.customer.city || '—'}, {selectedCustomer.customer.district}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Total Spent</div>
                <div style={{ fontSize: '0.9rem', color: '#16A34A', fontWeight: 700 }}>LKR {(selectedCustomer.stats.totalSpent || 0).toLocaleString()}</div>
              </div>
            </div>

            {/* Booking History */}
            <h3 style={{ fontSize: '1rem', color: '#0F172A', marginBottom: '0.75rem' }}>
              Booking History ({selectedCustomer.bookings.length})
            </h3>

            {selectedCustomer.bookings.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#94A3B8', background: '#F8FAFC', borderRadius: '8px' }}>
                This customer has not placed any bookings yet.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '280px', overflowY: 'auto' }}>
                {selectedCustomer.bookings.map(b => (
                  <div key={b.id} style={{ padding: '0.85rem', border: '1px solid #E2E8F0', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#0F172A' }}>
                        #{b.booking_number} &bull; {b.service_title}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                        Provider: {b.provider_name} &bull; Date: {b.scheduled_date} ({b.scheduled_time_slot})
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>
                        {b.final_amount > 0 ? `LKR ${b.final_amount.toLocaleString()}` : 'Quote'}
                      </span>
                      <span className={`badge badge-${b.status}`}>
                        {b.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Account Audit Logs */}
            {Array.isArray(selectedCustomer.auditLogs) && selectedCustomer.auditLogs.length > 0 && (
              <div style={{ marginTop: '1.25rem', borderTop: '1px solid #E2E8F0', paddingTop: '1rem' }}>
                <h4 style={{ fontSize: '0.9rem', color: '#0F172A', marginBottom: '0.5rem', fontWeight: 700 }}>
                  Account Management Audit Log
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '160px', overflowY: 'auto' }}>
                  {selectedCustomer.auditLogs.map((log) => (
                    <div key={log.id} style={{ fontSize: '0.78rem', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '6px', padding: '0.5rem 0.75rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: '#1E293B' }}>
                        <span>{log.action.replace(/_/g, ' ').toUpperCase()} by {log.performed_by_name || log.performed_by}</span>
                        <span style={{ color: '#64748B', fontWeight: 500 }}>{new Date(log.created_at).toLocaleString()}</span>
                      </div>
                      {log.reason && <div style={{ color: '#475569', marginTop: '0.15rem' }}>Reason: {log.reason}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 2: PROVIDER DETAILS (ADMINISTRATOR-ONLY VIEW)
         ========================================================================= */}
      {selectedProvider && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
          backdropFilter: 'blur(3px)'
        }}>
          <div className="card" style={{ width: '100%', maxWidth: '850px', maxHeight: '90vh', overflowY: 'auto', padding: '2rem', position: 'relative' }}>
            <button
              onClick={() => setSelectedProvider(null)}
              style={{ position: 'absolute', right: '1.25rem', top: '1.25rem', background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}
            >
              <X size={20} />
            </button>

            {/* Header info */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', borderBottom: '1px solid #E2E8F0', paddingBottom: '1rem', flexWrap: 'wrap' }}>
              <img
                src={selectedProvider.provider.avatar || 'https://images.unsplash.com/photo-1544717305-2782549b5136?w=120'}
                alt={selectedProvider.provider.name}
                style={{ width: '64px', height: '64px', borderRadius: '50%', objectFit: 'cover' }}
              />
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <h2 style={{ fontSize: '1.35rem', color: '#0F172A', margin: 0 }}>
                    {selectedProvider.provider.name}
                  </h2>
                  <span style={{
                    fontFamily: 'monospace',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    background: '#EFF6FF',
                    color: '#1E40AF',
                    padding: '0.2rem 0.6rem',
                    borderRadius: '4px',
                    border: '1px solid #BFDBFE'
                  }}>
                    ID: {selectedProvider.provider.confirmation_id || 'Pending'}
                  </span>
                  <span className={`badge ${selectedProvider.provider.verification_status === 'approved' ? 'badge-verified' : 'badge-pending'}`}>
                    {selectedProvider.provider.verification_status.replace(/_/g, ' ').toUpperCase()}
                  </span>
                </div>
                <div style={{ fontSize: '0.85rem', color: '#64748B', marginTop: '0.25rem' }}>
                  {selectedProvider.provider.category_name} &bull; {selectedProvider.provider.title} &bull; Registered {new Date(selectedProvider.provider.created_at).toLocaleDateString()}
                </div>
              </div>

              <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  onClick={() => setAccountModal({ open: true, mode: 'edit', role: 'provider', data: selectedProvider.provider })}
                  className="btn btn-secondary btn-sm"
                >
                  Edit Details
                </button>
                {selectedProvider.provider.user_status !== 'removed' ? (
                  <>
                    <button
                      onClick={() => handleToggleProviderStatus(selectedProvider.provider)}
                      className={`btn btn-sm ${
                        selectedProvider.provider.manual_suspended === 1 || selectedProvider.provider.suspension_type === 'manual'
                          ? 'btn-primary'
                          : 'btn-danger'
                      }`}
                    >
                      {selectedProvider.provider.manual_suspended === 1 || selectedProvider.provider.suspension_type === 'manual'
                        ? 'Reactivate Account'
                        : 'Suspend Account'}
                    </button>
                    <button
                      onClick={() => setRemoveModal({ open: true, role: 'provider', account: selectedProvider.provider })}
                      className="btn btn-danger btn-sm"
                    >
                      Remove Account
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => handleRestoreAccount(selectedProvider.provider, 'provider')}
                    className="btn btn-primary btn-sm"
                  >
                    Restore Account
                  </button>
                )}
              </div>
            </div>

            {/* Separate Account Access, Approval & Subscription Status Panel */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '0.85rem',
              marginBottom: '1.25rem'
            }}>
              {/* 1. Account Access Status */}
              <div style={{
                background: selectedProvider.provider.user_status === 'active' ? '#F0FDF4' : '#FEF2F2',
                border: `1px solid ${selectedProvider.provider.user_status === 'active' ? '#BBF7D0' : '#FECACA'}`,
                borderRadius: '8px',
                padding: '0.85rem 1rem'
              }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                  1. Account Access Status
                </div>
                <div style={{
                  fontSize: '0.9rem',
                  fontWeight: 800,
                  color: selectedProvider.provider.user_status === 'active' ? '#15803D' : '#B91C1C',
                  marginTop: '0.2rem'
                }}>
                  {selectedProvider.provider.user_status === 'removed'
                    ? 'Removed Account'
                    : selectedProvider.provider.manual_suspended === 1 || selectedProvider.provider.suspension_type === 'manual'
                    ? 'Manual Suspension (Admin)'
                    : selectedProvider.provider.subscription_suspended === 1 || selectedProvider.provider.suspension_type === 'subscription_unpaid'
                    ? 'Suspended — Unpaid Subscription (Automatic)'
                    : selectedProvider.provider.user_status === 'suspended'
                    ? 'Suspended'
                    : 'Active'}
                </div>
                {(selectedProvider.provider.manual_suspended === 1 || selectedProvider.provider.suspension_type === 'manual') && (
                  <div style={{ fontSize: '0.75rem', color: '#991B1B', marginTop: '0.35rem', lineHeight: 1.4 }}>
                    <div><strong>Reason:</strong> {selectedProvider.provider.manual_suspension_reason || selectedProvider.provider.suspension_reason || 'Manual suspension'}</div>
                    {selectedProvider.provider.manual_suspended_by_name && (
                      <div><strong>By:</strong> {selectedProvider.provider.manual_suspended_by_name}</div>
                    )}
                    {selectedProvider.provider.manual_suspended_at && (
                      <div><strong>At:</strong> {formatSriLankaDateTime(selectedProvider.provider.manual_suspended_at, true)}</div>
                    )}
                  </div>
                )}
              </div>

              {/* 2. Approval & Registration Payment Status */}
              <div style={{
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '8px',
                padding: '0.85rem 1rem'
              }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                  2. Approval &amp; Registration Fee
                </div>
                <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0F172A', marginTop: '0.2rem' }}>
                  {!selectedProvider.provider.registration_fee_paid && selectedProvider.provider.verification_status === 'pending'
                    ? 'Awaiting Registration Payment'
                    : selectedProvider.provider.verification_status === 'pending'
                    ? 'Pending Admin Approval'
                    : selectedProvider.provider.verification_status.replace(/_/g, ' ').toUpperCase()}
                </div>
                <div style={{ fontSize: '0.78rem', marginTop: '0.3rem', fontWeight: 600, color: selectedProvider.provider.registration_fee_paid ? '#047857' : '#B45309' }}>
                  Registration Fee: {selectedProvider.provider.registration_fee_paid ? 'Paid & Verified' : 'Unpaid'}
                </div>
              </div>

              {/* 3. Monthly Subscription Status */}
              <div style={{
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '8px',
                padding: '0.85rem 1rem'
              }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                  3. Monthly Subscription Status
                </div>
                <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0F172A', marginTop: '0.2rem' }}>
                  {selectedProvider.provider.subscription_status === 'active'
                    ? 'Active'
                    : selectedProvider.provider.subscription_status === 'past_due'
                    ? 'Past Due (5-Day Grace Period)'
                    : selectedProvider.provider.subscription_status === 'suspended_unpaid'
                    ? 'Suspended — Unpaid Subscription'
                    : 'Pending First Subscription Payment'}
                </div>
                {selectedProvider.provider.next_due_date && (
                  <div style={{ fontSize: '0.75rem', color: '#475569', marginTop: '0.25rem' }}>
                    Due: <strong>{formatSriLankaDateTime(selectedProvider.provider.next_due_date, true)}</strong>
                  </div>
                )}
                {selectedProvider.provider.grace_period_end && (
                  <div style={{ fontSize: '0.75rem', color: '#B45309', marginTop: '0.15rem', fontWeight: 600 }}>
                    5-Day Grace Deadline: {formatSriLankaDateTime(selectedProvider.provider.grace_period_end, true)}
                  </div>
                )}
              </div>
            </div>

            {/* Provider Stats Bar */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '1.5rem', background: '#F8FAFC', padding: '1rem', borderRadius: '8px' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Phone & Email</div>
                <div style={{ fontSize: '0.85rem', color: '#0F172A', fontWeight: 600 }}>{selectedProvider.provider.phone || 'No phone'}</div>
                <div style={{ fontSize: '0.8rem', color: '#64748B' }}>{selectedProvider.provider.email}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Rates & Pricing</div>
                <div style={{ fontSize: '0.85rem', color: '#0F172A', fontWeight: 600 }}>
                  LKR {selectedProvider.provider.base_rate} ({selectedProvider.provider.pricing_type})
                </div>
                <div style={{ fontSize: '0.8rem', color: '#64748B' }}>{selectedProvider.provider.experience_years} yrs exp</div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Service Towns</div>
                <div style={{ fontSize: '0.85rem', color: '#0F172A', fontWeight: 600 }}>
                  {selectedProvider.provider.service_towns || selectedProvider.provider.city || selectedProvider.provider.district}
                </div>
                <div style={{ fontSize: '0.8rem', color: '#64748B' }}>{selectedProvider.provider.district}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Ratings & Jobs</div>
                <div style={{ fontSize: '0.85rem', color: '#F59E0B', fontWeight: 700 }}>
                  ★ {selectedProvider.provider.rating_avg > 0 ? selectedProvider.provider.rating_avg.toFixed(1) : 'New'} ({selectedProvider.provider.review_count} reviews)
                </div>
                <div style={{ fontSize: '0.8rem', color: '#16A34A', fontWeight: 600 }}>
                  {selectedProvider.stats.completedJobs} completed jobs
                </div>
              </div>
            </div>

            {/* Verification Documents & Audit Trail */}
            <div style={{ marginBottom: '1.5rem', background: '#F1F5F9', borderRadius: '8px', padding: '1rem', border: '1px solid #CBD5E1' }}>
              <h4 style={{ fontSize: '0.9rem', color: '#0F172A', margin: '0 0 0.5rem 0', fontWeight: 700 }}>
                Verification Documents & Audit Trail
              </h4>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                {Array.isArray(selectedProvider.provider.verification_documents) && selectedProvider.provider.verification_documents.length > 0 ? (
                  selectedProvider.provider.verification_documents.map((doc, idx) => (
                    <div key={idx} style={{ background: '#fff', border: '1px solid #CBD5E1', borderRadius: '6px', padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}>
                      <strong>{doc.type || 'Document'}:</strong> {doc.number || doc.name || 'Provided'}
                    </div>
                  ))
                ) : (
                  <div style={{ fontSize: '0.8rem', color: '#64748B' }}>No documents uploaded.</div>
                )}
              </div>

              {selectedProvider.provider.reviewed_by ? (
                <div style={{ fontSize: '0.8rem', color: '#334155', background: '#fff', padding: '0.6rem 0.75rem', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                  <strong>Decision audit:</strong> Marked as <em>{selectedProvider.provider.verification_status}</em> by {selectedProvider.provider.reviewer_name || selectedProvider.provider.reviewed_by} on {new Date(selectedProvider.provider.reviewed_at).toLocaleString()}.
                  {selectedProvider.provider.decision_reason && (
                    <div style={{ marginTop: '0.25rem', color: '#B45309' }}>
                      Reason / Notes: {selectedProvider.provider.decision_reason}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ fontSize: '0.8rem', color: '#64748B' }}>No administrator review recorded yet.</div>
              )}
            </div>

            {/* Booking History */}
            <h4 style={{ fontSize: '0.95rem', color: '#0F172A', marginBottom: '0.5rem', fontWeight: 700 }}>
              Assigned Bookings ({selectedProvider.bookings.length})
            </h4>
            {selectedProvider.bookings.length === 0 ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: '#94A3B8', background: '#F8FAFC', borderRadius: '8px' }}>
                No bookings assigned to this provider yet.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '220px', overflowY: 'auto' }}>
                {selectedProvider.bookings.map(b => (
                  <div key={b.id} style={{ padding: '0.6rem 0.85rem', border: '1px solid #E2E8F0', borderRadius: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                    <div>
                      <strong>#{b.booking_number}</strong> &bull; {b.service_title}
                      <span style={{ color: '#64748B', marginLeft: '0.5rem', fontSize: '0.75rem' }}>Customer: {b.customer_name}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span>LKR {b.final_amount?.toLocaleString() || 0}</span>
                      <span className={`badge badge-${b.status}`}>{b.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Account Audit Logs */}
            {Array.isArray(selectedProvider.auditLogs) && selectedProvider.auditLogs.length > 0 && (
              <div style={{ marginTop: '1.25rem', borderTop: '1px solid #E2E8F0', paddingTop: '1rem' }}>
                <h4 style={{ fontSize: '0.9rem', color: '#0F172A', marginBottom: '0.5rem', fontWeight: 700 }}>
                  Account Management Audit Log
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '160px', overflowY: 'auto' }}>
                  {selectedProvider.auditLogs.map((log) => (
                    <div key={log.id} style={{ fontSize: '0.78rem', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '6px', padding: '0.5rem 0.75rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: '#1E293B' }}>
                        <span>{log.action.replace(/_/g, ' ').toUpperCase()} by {log.performed_by_name || log.performed_by}</span>
                        <span style={{ color: '#64748B', fontWeight: 500 }}>{new Date(log.created_at).toLocaleString()}</span>
                      </div>
                      {log.reason && <div style={{ color: '#475569', marginTop: '0.15rem' }}>Reason: {log.reason}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 3: MANUAL ADMINISTRATOR DECISION (APPROVE / REJECT / REQUEST CHANGES)
         ========================================================================= */}
      {reviewModalProvider && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
          backdropFilter: 'blur(3px)'
        }}>
          <div className="card" style={{ width: '100%', maxWidth: '580px', padding: '2rem', position: 'relative' }}>
            <button
              onClick={() => setReviewModalProvider(null)}
              style={{ position: 'absolute', right: '1.25rem', top: '1.25rem', background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}
            >
              <X size={20} />
            </button>

            <h2 style={{ fontSize: '1.25rem', color: '#0F172A', marginBottom: '0.25rem' }}>
              Review Provider Application
            </h2>
            <div style={{ fontSize: '0.85rem', color: '#64748B', marginBottom: '1rem' }}>
              Provider: <strong>{reviewModalProvider.name}</strong> &bull; Confirmation ID: <strong style={{ color: '#1E40AF' }}>{reviewModalProvider.confirmation_id || 'Pending'}</strong>
            </div>

            {!reviewModalProvider.registration_fee_paid && (
              <div style={{
                background: '#FEF2F2',
                border: '1px solid #FECACA',
                borderRadius: '8px',
                padding: '0.85rem 1rem',
                marginBottom: '1.1rem',
                fontSize: '0.82rem',
                color: '#991B1B'
              }}>
                <strong>Registration Payment Required Before Approval:</strong> This provider has not yet completed their one-time registration fee payment (`Awaiting Registration Payment`). The Approve action is disabled until payment is verified on the server.
              </div>
            )}

            <form onSubmit={handleSubmitDecision}>
              {/* Action Selector */}
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="form-label">Administrator Decision</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                  <button
                    type="button"
                    disabled={!reviewModalProvider.registration_fee_paid}
                    onClick={() => {
                      if (!reviewModalProvider.registration_fee_paid) return;
                      setDecisionAction('approved');
                    }}
                    style={{
                      padding: '0.6rem 0.5rem',
                      borderRadius: '6px',
                      border: decisionAction === 'approved' ? '2px solid #10B981' : '1px solid #CBD5E1',
                      background: !reviewModalProvider.registration_fee_paid
                        ? '#F1F5F9'
                        : decisionAction === 'approved'
                        ? '#ECFDF5'
                        : '#FFFFFF',
                      color: !reviewModalProvider.registration_fee_paid
                        ? '#94A3B8'
                        : decisionAction === 'approved'
                        ? '#065F46'
                        : '#334155',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      cursor: !reviewModalProvider.registration_fee_paid ? 'not-allowed' : 'pointer'
                    }}
                  >
                    ✓ Approve {!reviewModalProvider.registration_fee_paid ? '(Unpaid)' : ''}
                  </button>

                  <button
                    type="button"
                    onClick={() => setDecisionAction('request_changes')}
                    style={{
                      padding: '0.6rem 0.5rem',
                      borderRadius: '6px',
                      border: decisionAction === 'request_changes' ? '2px solid #EA580C' : '1px solid #CBD5E1',
                      background: decisionAction === 'request_changes' ? '#FFF7ED' : '#FFFFFF',
                      color: decisionAction === 'request_changes' ? '#9A3412' : '#334155',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      cursor: 'pointer'
                    }}
                  >
                    ⚠ Request Changes
                  </button>

                  <button
                    type="button"
                    onClick={() => setDecisionAction('rejected')}
                    style={{
                      padding: '0.6rem 0.5rem',
                      borderRadius: '6px',
                      border: decisionAction === 'rejected' ? '2px solid #EF4444' : '1px solid #CBD5E1',
                      background: decisionAction === 'rejected' ? '#FEF2F2' : '#FFFFFF',
                      color: decisionAction === 'rejected' ? '#991B1B' : '#334155',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      cursor: 'pointer'
                    }}
                  >
                    ✕ Reject
                  </button>
                </div>
              </div>

              {/* Decision Explanation Note */}
              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label className="form-label" htmlFor="decisionNotes">
                  {decisionAction === 'approved'
                    ? 'Internal Audit Notes (Optional)'
                    : decisionAction === 'request_changes'
                    ? 'Explain which information or documents must be corrected (Mandatory):'
                    : 'Reason for Rejection (Mandatory):'}
                </label>
                <textarea
                  id="decisionNotes"
                  className="form-control"
                  rows={4}
                  required={decisionAction !== 'approved'}
                  placeholder={
                    decisionAction === 'approved'
                      ? 'e.g. Identity verified via NIC, credentials confirmed.'
                      : decisionAction === 'request_changes'
                      ? 'e.g. Please re-upload a clearer image of your National Identity Card (NIC) and specify experience years.'
                      : 'e.g. Submitted documents did not meet verification criteria.'
                  }
                  value={decisionNotes}
                  onChange={(e) => setDecisionNotes(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setReviewModalProvider(null)}
                  className="btn btn-secondary"
                  disabled={submittingDecision}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submittingDecision || (decisionAction === 'approved' && !reviewModalProvider.registration_fee_paid)}
                  style={{
                    background:
                      decisionAction === 'approved'
                        ? '#10B981'
                        : decisionAction === 'request_changes'
                        ? '#EA580C'
                        : '#EF4444',
                    borderColor:
                      decisionAction === 'approved'
                        ? '#10B981'
                        : decisionAction === 'request_changes'
                        ? '#EA580C'
                        : '#EF4444',
                    opacity: (decisionAction === 'approved' && !reviewModalProvider.registration_fee_paid) ? 0.5 : 1,
                    cursor: (decisionAction === 'approved' && !reviewModalProvider.registration_fee_paid) ? 'not-allowed' : 'pointer'
                  }}
                >
                  {submittingDecision ? 'Recording Decision…' : `Confirm ${decisionAction.replace(/_/g, ' ').toUpperCase()}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 4: BOOKING DETAILS (ADMINISTRATOR VIEW)
         ========================================================================= */}
      {selectedBooking && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
          backdropFilter: 'blur(3px)'
        }}>
          <div className="card" style={{ width: '100%', maxWidth: '640px', padding: '2rem', position: 'relative' }}>
            <button
              onClick={() => setSelectedBooking(null)}
              style={{ position: 'absolute', right: '1.25rem', top: '1.25rem', background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}
            >
              <X size={20} />
            </button>

            <div style={{ borderBottom: '1px solid #E2E8F0', paddingBottom: '1rem', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <h2 style={{ fontSize: '1.3rem', color: '#0F172A', margin: 0 }}>
                  Booking #{selectedBooking.booking_number}
                </h2>
                <span className={`badge badge-${selectedBooking.status}`}>
                  {selectedBooking.status.replace(/_/g, ' ')}
                </span>
              </div>
              <div style={{ fontSize: '0.85rem', color: '#64748B', marginTop: '0.25rem' }}>
                Placed on {new Date(selectedBooking.created_at).toLocaleString()}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginBottom: '1.25rem' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Customer</div>
                <div style={{ fontWeight: 600, color: '#0F172A' }}>{selectedBooking.customer_name}</div>
                <div style={{ fontSize: '0.8rem', color: '#64748B' }}>{selectedBooking.customer_phone || selectedBooking.customer_email}</div>
              </div>

              <div>
                <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Service Provider</div>
                <div style={{ fontWeight: 600, color: '#0F172A' }}>{selectedBooking.provider_name}</div>
                <div style={{ fontSize: '0.8rem', color: '#64748B' }}>ID: {selectedBooking.provider_confirmation_id || 'Provider'}</div>
              </div>

              <div>
                <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Scheduled Time</div>
                <div style={{ fontWeight: 600, color: '#0F172A' }}>{selectedBooking.scheduled_date}</div>
                <div style={{ fontSize: '0.8rem', color: '#64748B' }}>Slot: {selectedBooking.scheduled_time_slot}</div>
              </div>

              <div>
                <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Pricing & Commission</div>
                <div style={{ fontWeight: 700, color: '#10B981' }}>
                  {selectedBooking.final_amount > 0 ? `LKR ${selectedBooking.final_amount.toLocaleString()}` : 'Quote Request'}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                  Platform fee: LKR {selectedBooking.platform_commission_amount || 0}
                </div>
              </div>
            </div>

            <div style={{ background: '#F8FAFC', padding: '0.85rem', borderRadius: '6px', marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                Task Description
              </div>
              <div style={{ fontSize: '0.875rem', color: '#334155' }}>
                {selectedBooking.task_description}
              </div>
            </div>

            {/* Quick Admin status adjustment */}
            <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '1rem' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0F172A', marginBottom: '0.4rem' }}>
                Platform Booking Fee Status:{' '}
                <span style={{
                  color: selectedBooking.booking_fee_status === 'paid' ? '#047857' : '#B91C1C'
                }}>
                  {selectedBooking.booking_fee_status === 'paid' ? 'PAID & VERIFIED' : 'UNPAID (Awaiting Customer Booking Fee)'}
                </span>
              </div>
              {selectedBooking.booking_fee_status !== 'paid' && (
                <div style={{ fontSize: '0.76rem', color: '#991B1B', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '6px', padding: '0.5rem 0.75rem', marginBottom: '0.65rem' }}>
                  This booking cannot be submitted to the provider or confirmed until the customer booking fee payment is verified on the server.
                </div>
              )}
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0F172A', marginBottom: '0.5rem' }}>
                Update Booking &amp; Job Payment Status (Admin Override):
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <select
                  value={selectedBooking.status}
                  onChange={(e) => handleUpdateBookingStatus(selectedBooking.id, e.target.value, null)}
                  className="form-control"
                  style={{ width: 'auto', fontSize: '0.8rem' }}
                >
                  <option value="awaiting_payment">Awaiting Booking Fee Payment</option>
                  <option value="pending" disabled={selectedBooking.booking_fee_status !== 'paid'}>Pending Provider Acceptance</option>
                  <option value="confirmed" disabled={selectedBooking.booking_fee_status !== 'paid'}>Confirmed</option>
                  <option value="in_progress" disabled={selectedBooking.booking_fee_status !== 'paid'}>In Progress</option>
                  <option value="completed" disabled={selectedBooking.booking_fee_status !== 'paid'}>Completed</option>
                  <option value="declined">Declined</option>
                  <option value="cancelled">Cancelled</option>
                </select>

                <select
                  defaultValue={selectedBooking.payment_status}
                  onChange={(e) => handleUpdateBookingStatus(selectedBooking.id, null, e.target.value)}
                  className="form-control"
                  style={{ width: 'auto', fontSize: '0.8rem' }}
                >
                  <option value="unpaid">Unpaid</option>
                  <option value="paid_direct">Paid Direct</option>
                  <option value="waived">Waived</option>
                  <option value="refunded">Refunded</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          ACCOUNT MANAGEMENT MODALS (ADD, EDIT, SUSPEND/REACTIVATE, REMOVE)
         ========================================================================= */}
      <AddEditAccountModal
        isOpen={accountModal.open}
        mode={accountModal.mode}
        role={accountModal.role}
        initialData={accountModal.data}
        categories={categoriesList}
        token={token}
        onClose={() => setAccountModal({ open: false, mode: 'add', role: 'customer', data: null })}
        onSuccess={() => {
          loadAdminData();
          if (accountModal.mode === 'edit' && accountModal.data?.id) {
            if (accountModal.role === 'customer' && selectedCustomer?.customer?.id === accountModal.data.id) {
              handleViewCustomerDetails(accountModal.data.id);
            }
            if (accountModal.role === 'provider' && selectedProvider?.provider?.id === accountModal.data.id) {
              handleViewProviderDetails(accountModal.data.id);
            }
          }
        }}
      />

      <SuspendAccountModal
        isOpen={suspendModal.open}
        account={suspendModal.account}
        role={suspendModal.role}
        token={token}
        onClose={() => setSuspendModal({ open: false, role: 'customer', account: null })}
        onSuccess={() => {
          loadAdminData();
          if (suspendModal.account?.id) {
            if (suspendModal.role === 'customer' && selectedCustomer?.customer?.id === suspendModal.account.id) {
              handleViewCustomerDetails(suspendModal.account.id);
            }
            if (suspendModal.role === 'provider' && selectedProvider?.provider?.id === suspendModal.account.id) {
              handleViewProviderDetails(suspendModal.account.id);
            }
          }
        }}
      />

      <RemoveAccountModal
        isOpen={removeModal.open}
        account={removeModal.account}
        role={removeModal.role}
        token={token}
        onClose={() => setRemoveModal({ open: false, role: 'customer', account: null })}
        onNavigateToTab={(tabName) => {
          setSelectedCustomer(null);
          setSelectedProvider(null);
          setActiveTab(tabName);
        }}
        onSuccess={() => {
          setSelectedCustomer(null);
          setSelectedProvider(null);
          loadAdminData();
        }}
      />

      {/* =========================================================================
          DELETE NOTIFICATIONS CONFIRMATION MODAL
         ========================================================================= */}
      {notifDeleteConfirmModal.open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-notifications-modal-title"
          onClick={() => {
            if (!deletingNotifs) {
              setNotifDeleteConfirmModal({ open: false, ids: [], mode: 'bulk' });
            }
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            zIndex: 1100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            backdropFilter: 'blur(3px)'
          }}
        >
          <div
            className="card"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'calc(100% - 32px)',
              maxWidth: '460px',
              padding: '1.5rem',
              borderRadius: '14px',
              position: 'relative',
              background: '#FFFFFF',
              boxShadow: '0 20px 25px -5px rgba(15, 23, 42, 0.25)'
            }}
          >
            <button
              type="button"
              disabled={deletingNotifs}
              onClick={() => setNotifDeleteConfirmModal({ open: false, ids: [], mode: 'bulk' })}
              aria-label="Close confirmation dialog"
              style={{
                position: 'absolute',
                right: '1rem',
                top: '1rem',
                background: 'none',
                border: 'none',
                cursor: deletingNotifs ? 'not-allowed' : 'pointer',
                color: '#64748B',
                padding: '0.25rem'
              }}
            >
              <X size={18} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.85rem' }}>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '10px',
                  background: '#FEF2F2',
                  border: '1px solid #FECACA',
                  color: '#DC2626',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
              >
                <Trash2 size={20} />
              </div>
              <div>
                <h2
                  id="delete-notifications-modal-title"
                  style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0F172A', margin: 0 }}
                >
                  Delete these notifications from your inbox?
                </h2>
                <div style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '0.15rem' }}>
                  {notifDeleteConfirmModal.ids.length === 1
                    ? '1 notification selected for deletion.'
                    : `${notifDeleteConfirmModal.ids.length} notifications selected for deletion.`}
                </div>
              </div>
            </div>

            <p style={{ fontSize: '0.85rem', color: '#475569', lineHeight: 1.5, margin: '0 0 1.25rem 0' }}>
              This will permanently remove the selected notification{notifDeleteConfirmModal.ids.length === 1 ? '' : 's'} only from your administrator inbox. Other administrators and all related accounts, bookings, payments, applications and audit records will be preserved.
            </p>

            {notifDeleteError && (
              <div
                role="alert"
                style={{
                  background: '#FEF2F2',
                  border: '1px solid #FECACA',
                  borderRadius: '8px',
                  padding: '0.65rem 0.85rem',
                  marginBottom: '1rem',
                  fontSize: '0.8rem',
                  color: '#991B1B'
                }}
              >
                {notifDeleteError}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.65rem' }}>
              <button
                type="button"
                disabled={deletingNotifs}
                onClick={() => setNotifDeleteConfirmModal({ open: false, ids: [], mode: 'bulk' })}
                className="btn btn-secondary btn-sm"
                style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={deletingNotifs}
                onClick={handleConfirmDeleteNotifications}
                className="btn btn-sm"
                style={{
                  background: '#DC2626',
                  borderColor: '#DC2626',
                  color: '#FFFFFF',
                  padding: '0.5rem 1.1rem',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  borderRadius: '6px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  cursor: deletingNotifs ? 'not-allowed' : 'pointer',
                  opacity: deletingNotifs ? 0.65 : 1
                }}
              >
                <Trash2 size={15} />
                <span>{deletingNotifs ? 'Deleting…' : 'Delete'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
