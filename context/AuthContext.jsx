'use client';
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [providerProfile, setProviderProfile] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalTab, setAuthModalTab] = useState('login'); // 'login' | 'register' | 'register_provider'
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchCurrentUser = useCallback(async (authToken) => {
    try {
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setProviderProfile(data.providerProfile || null);
        return data.user;
      } else {
        localStorage.removeItem('jobzy_token');
        setToken(null);
        setUser(null);
        setProviderProfile(null);
      }
    } catch (err) {
      console.error('Failed to fetch user:', err);
    }
    return null;
  }, []);

  const fetchNotifications = useCallback(async () => {
    const currentToken = token || localStorage.getItem('jobzy_token');
    if (!currentToken) return;

    try {
      const res = await fetch('/api/notifications', {
        headers: { Authorization: `Bearer ${currentToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      } else if (res.status === 401 || res.status === 403) {
        // Session revoked due to account suspension or removal
        localStorage.removeItem('jobzy_token');
        setToken(null);
        setUser(null);
        setProviderProfile(null);
        setNotifications([]);
        setUnreadCount(0);
      }
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    }
  }, [token]);

  useEffect(() => {
    const savedToken = localStorage.getItem('jobzy_token');
    if (savedToken) {
      setToken(savedToken);
      fetchCurrentUser(savedToken).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [fetchCurrentUser]);

  useEffect(() => {
    if (user && token) {
      fetchNotifications();
      const interval = setInterval(fetchNotifications, 15000);
      return () => clearInterval(interval);
    }
  }, [user, token, fetchNotifications]);

  const login = async (email, password, expectedRole = null) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, ...(expectedRole ? { expectedRole } : {}) })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Login failed.');
    }
    localStorage.setItem('jobzy_token', data.token);
    setToken(data.token);
    setUser(data.user);
    setAuthModalOpen(false);
    await fetchCurrentUser(data.token);
    return data;
  };

  const register = async (formData) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Registration failed.');
    }
    localStorage.setItem('jobzy_token', data.token);
    setToken(data.token);
    setUser(data.user);
    setAuthModalOpen(false);
    await fetchCurrentUser(data.token);
    return data;
  };

  const logout = () => {
    localStorage.removeItem('jobzy_token');
    setToken(null);
    setUser(null);
    setProviderProfile(null);
    setNotifications([]);
    setUnreadCount(0);
    fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
  };

  const openAuth = (tab = 'login') => {
    setAuthModalTab(tab);
    setAuthModalOpen(true);
  };

  const closeAuth = () => {
    setAuthModalOpen(false);
  };

  const markNotificationRead = async (id) => {
    if (!token) return;
    try {
      await fetch(`/api/notifications/${id}/read`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchNotifications();
    } catch (err) {
      console.error(err);
    }
  };

  const markAllNotificationsRead = async () => {
    if (!token) return;
    try {
      await fetch('/api/notifications', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchNotifications();
    } catch (err) {
      console.error(err);
    }
  };

  const deleteNotifications = async (ids) => {
    const currentToken = token || localStorage.getItem('jobzy_token');
    if (!currentToken) {
      throw new Error('Authentication required.');
    }

    const idList = Array.isArray(ids) ? ids : [ids];
    const res = await fetch('/api/notifications', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${currentToken}`
      },
      body: JSON.stringify({ ids: idList })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Failed to delete notifications.');
    }

    if (Array.isArray(data.notifications)) {
      setNotifications(data.notifications);
    } else {
      await fetchNotifications();
    }

    if (typeof data.unreadCount === 'number') {
      setUnreadCount(data.unreadCount);
    }

    return data;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        providerProfile,
        token,
        loading,
        authModalOpen,
        authModalTab,
        notifications,
        unreadCount,
        login,
        register,
        logout,
        openAuth,
        closeAuth,
        setAuthModalTab,
        setUser,
        updateUser: (nextUser) => setUser((prev) => (prev ? { ...prev, ...nextUser } : nextUser)),
        fetchCurrentUser: () => token && fetchCurrentUser(token),
        fetchNotifications,
        markNotificationRead,
        markAllNotificationsRead,
        deleteNotifications
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
