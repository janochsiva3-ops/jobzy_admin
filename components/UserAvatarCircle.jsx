'use client';
import React, { useState, useEffect } from 'react';

export function getUserInitials(name) {
  if (!name || typeof name !== 'string') return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Universal circular avatar component for all roles (customer, provider, admin).
 * Renders the custom profile picture if present, or a clean initials circle if null/removed.
 */
export default function UserAvatarCircle({ user, size = 32, style = {} }) {
  const [imgError, setImgError] = useState(false);
  const avatarUrl = user?.avatar && String(user.avatar).trim().length > 0 ? String(user.avatar).trim() : null;

  useEffect(() => {
    setImgError(false);
  }, [avatarUrl]);

  if (avatarUrl && !imgError) {
    return (
      <img
        src={avatarUrl}
        alt={user?.name || 'User avatar'}
        onError={() => setImgError(true)}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          borderRadius: '50%',
          objectFit: 'cover',
          flexShrink: 0,
          display: 'block',
          ...style
        }}
      />
    );
  }

  const initials = getUserInitials(user?.name);
  const fontSize = Math.max(10, Math.round(size * 0.38));

  const role = user?.role || 'customer';
  const bg = role === 'admin' ? '#1D4ED8' : role === 'provider' ? '#0F766E' : '#475569';

  return (
    <span
      aria-label={user?.name || 'User avatar'}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: '50%',
        background: bg,
        color: '#FFFFFF',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 800,
        fontSize: `${fontSize}px`,
        letterSpacing: '0.04em',
        userSelect: 'none',
        flexShrink: 0,
        ...style
      }}
    >
      {initials}
    </span>
  );
}

