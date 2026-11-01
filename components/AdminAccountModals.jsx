'use client';
import React, { useState, useEffect, useRef } from 'react';
import {
  X, Eye, Edit3, UserX, UserCheck, Trash2, RotateCcw, MoreVertical,
  AlertTriangle, CheckCircle2, ShieldAlert, Copy, Check, ExternalLink,
  Mail, Phone, MapPin, Briefcase, Calendar, CreditCard
} from 'lucide-react';
import { formatSriLankaDateTime } from '@/lib/dateUtils';

const SRI_LANKA_DISTRICTS = [
  'Colombo', 'Gampaha', 'Kalutara', 'Kandy', 'Matale', 'Nuwara Eliya',
  'Galle', 'Matara', 'Hambantota', 'Jaffna', 'Kilinochchi', 'Mannar',
  'Vavuniya', 'Mullaitivu', 'Batticaloa', 'Ampara', 'Trincomalee',
  'Kurunegala', 'Puttalam', 'Anuradhapura', 'Polonnaruwa', 'Badulla',
  'Moneragala', 'Ratnapura', 'Kegalle'
];

/**
 * Actions menu beside each Customer or Service Provider row
 */
export function AccountActionsMenu({
  account,
  role,
  onViewDetails,
  onEditDetails,
  onSuspendOrReactivate,
  onRemoveAccount,
  onRestoreAccount
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const triggerBtnRef = useRef(null);
  const status = role === 'provider' ? (account.user_status || account.status) : account.status;
  const isManuallySuspended =
    role === 'provider'
      ? Boolean(account.manual_suspended === 1 || (status === 'suspended' && account.suspension_type === 'manual'))
      : status === 'suspended';

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const itemStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.55rem',
    width: '100%',
    padding: '0.55rem 0.85rem',
    border: 'none',
    background: 'transparent',
    fontSize: '0.82rem',
    fontWeight: 600,
    color: '#1E293B',
    textAlign: 'left',
    cursor: 'pointer',
    borderRadius: '6px'
  };

  return (
    <div ref={menuRef} style={{ position: 'relative', display: 'inline-block', textAlign: 'left' }}>
      <button
        ref={triggerBtnRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="btn btn-secondary btn-sm"
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.35rem',
          padding: '0.35rem 0.65rem',
          fontSize: '0.78rem',
          fontWeight: 600
        }}
      >
        <span>Actions</span>
        <MoreVertical size={14} />
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 4px)',
            minWidth: '185px',
            background: '#FFFFFF',
            border: '1px solid #CBD5E1',
            borderRadius: '10px',
            boxShadow: '0 12px 28px rgba(15, 23, 42, 0.16)',
            padding: '0.35rem',
            zIndex: 100
          }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onViewDetails();
            }}
            style={itemStyle}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#F1F5F9')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <Eye size={14} color="#2563EB" />
            <span>View Details</span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onEditDetails();
            }}
            style={itemStyle}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#F1F5F9')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <Edit3 size={14} color="#475569" />
            <span>Edit Details</span>
          </button>

          {status !== 'removed' ? (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onSuspendOrReactivate();
                }}
                style={{
                  ...itemStyle,
                  color: !isManuallySuspended ? '#B45309' : '#15803D'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = !isManuallySuspended ? '#FFFBEB' : '#F0FDF4')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                {!isManuallySuspended ? (
                  <>
                    <UserX size={14} color="#D97706" />
                    <span>Suspend Account</span>
                  </>
                ) : (
                  <>
                    <UserCheck size={14} color="#16A34A" />
                    <span>Reactivate Account</span>
                  </>
                )}
              </button>

              <div style={{ height: '1px', background: '#E2E8F0', margin: '0.25rem 0' }} />

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  if (triggerBtnRef.current) triggerBtnRef.current.focus();
                  onRemoveAccount();
                }}
                style={{ ...itemStyle, color: '#DC2626' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#FEF2F2')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <Trash2 size={14} color="#DC2626" />
                <span>Remove Account</span>
              </button>
            </>
          ) : (
            <>
              <div style={{ height: '1px', background: '#E2E8F0', margin: '0.25rem 0' }} />
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onRestoreAccount();
                }}
                style={{ ...itemStyle, color: '#15803D' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#F0FDF4')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <RotateCcw size={14} color="#16A34A" />
                <span>Restore Account</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Add or Edit Customer / Service Provider Modal
 */
export function AddEditAccountModal({
  isOpen,
  mode, // 'add' | 'edit'
  role, // 'customer' | 'provider'
  initialData,
  categories = [],
  token,
  onClose,
  onSuccess
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [district, setDistrict] = useState('Colombo');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');

  // Provider-specific fields
  const [categoryId, setCategoryId] = useState('');
  const [title, setTitle] = useState('');
  const [experienceYears, setExperienceYears] = useState('1');
  const [pricingType, setPricingType] = useState('hourly');
  const [baseRate, setBaseRate] = useState('');
  const [bio, setBio] = useState('');
  const [skillsText, setSkillsText] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [createdResult, setCreatedResult] = useState(null);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setError('');
    setCreatedResult(null);
    setCopiedLink(false);

    if (mode === 'edit' && initialData) {
      setName(initialData.name || '');
      setEmail(initialData.email || '');
      setPhone(initialData.phone || '');
      setDistrict(initialData.district || 'Colombo');
      setCity(initialData.city || '');
      setAddress(initialData.address || '');
      if (role === 'provider') {
        setCategoryId(initialData.category_id || (categories[0]?.id || 'cat-electrician'));
        setTitle(initialData.title || '');
        setExperienceYears(String(initialData.experience_years ?? 1));
        setPricingType(initialData.pricing_type || 'hourly');
        setBaseRate(String(initialData.base_rate ?? ''));
        setBio(initialData.bio || '');
        const parsedSkills = Array.isArray(initialData.skills)
          ? initialData.skills.join(', ')
          : '';
        setSkillsText(parsedSkills);
      }
    } else {
      setName('');
      setEmail('');
      setPhone('');
      setDistrict('Colombo');
      setCity('');
      setAddress('');
      setCategoryId(categories[0]?.id || 'cat-electrician');
      setTitle('');
      setExperienceYears('2');
      setPricingType('hourly');
      setBaseRate('1500');
      setBio('');
      setSkillsText('');
    }
  }, [isOpen, mode, role, initialData, categories]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const isAdd = mode === 'add';
      const endpoint =
        role === 'customer'
          ? isAdd
            ? '/api/admin/customers'
            : `/api/admin/customers/${initialData.id}`
          : isAdd
          ? '/api/admin/providers'
          : `/api/admin/providers/${initialData.id}`;

      const payload = {
        action: isAdd ? undefined : 'edit',
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        district,
        city: city.trim(),
        address: address.trim()
      };

      if (role === 'provider') {
        payload.categoryId = categoryId;
        payload.title = title.trim();
        payload.experienceYears = parseInt(experienceYears, 10) || 0;
        payload.pricingType = pricingType;
        payload.baseRate = parseFloat(baseRate) || 0;
        payload.bio = bio.trim();
        payload.skills = skillsText
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      }

      const res = await fetch(endpoint, {
        method: isAdd ? 'POST' : 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to save account details.');
      } else {
        if (isAdd) {
          setCreatedResult(data);
          onSuccess();
        } else {
          onSuccess();
          onClose();
        }
      }
    } catch (err) {
      setError('Network error while saving account.');
    } finally {
      setSubmitting(false);
    }
  };

  const fullInviteUrl =
    createdResult?.invitationUrl
      ? createdResult.invitationUrl.startsWith('http')
        ? createdResult.invitationUrl
        : typeof window !== 'undefined'
        ? `${window.location.origin}${createdResult.invitationUrl}`
        : createdResult.invitationUrl
      : '';

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: '620px', width: '100%' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#0F172A' }}>
              {mode === 'add'
                ? role === 'customer'
                  ? 'Add New Customer Account'
                  : 'Add New Service Provider Account'
                : role === 'customer'
                ? 'Edit Customer Details'
                : 'Edit Service Provider Details'}
            </h3>
            <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8rem', color: '#64748B' }}>
              {mode === 'add'
                ? 'Creates an unverified account and generates a secure email invitation link so the user can set their own password.'
                : 'Update account contact and profile details. Changes are recorded in the administrator audit log.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}
          >
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          {createdResult ? (
            <div>
              <div
                style={{
                  background: '#ECFDF5',
                  border: '1px solid #A7F3D0',
                  borderRadius: '10px',
                  padding: '1.1rem',
                  marginBottom: '1.25rem'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#065F46', fontWeight: 700, marginBottom: '0.35rem' }}>
                  <CheckCircle2 size={18} />
                  <span>Account Created &amp; Secure Invitation Dispatched</span>
                </div>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#047857' }}>
                  {createdResult.message}
                </p>
              </div>

              {role === 'provider' && createdResult.provider && (
                <div
                  style={{
                    background: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    borderRadius: '10px',
                    padding: '1rem',
                    marginBottom: '1.25rem'
                  }}
                >
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748B', marginBottom: '0.5rem' }}>
                    Separate Provider Statuses (Strictly Enforced)
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem' }}>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#64748B' }}>Registration ID</div>
                      <div style={{ fontFamily: 'monospace', fontWeight: 800, color: '#1E40AF', fontSize: '0.9rem' }}>
                        {createdResult.provider.confirmationId}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#64748B' }}>Admin Approval</div>
                      <span className="badge badge-pending">PENDING REVIEW</span>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#64748B' }}>Registration Fee</div>
                      <span className="badge badge-declined">UNPAID</span>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#64748B' }}>Monthly Subscription</div>
                      <span className="badge badge-declined">INACTIVE</span>
                    </div>
                  </div>
                </div>
              )}

              <div
                style={{
                  background: '#EFF6FF',
                  border: '1px solid #BFDBFE',
                  borderRadius: '10px',
                  padding: '1rem'
                }}
              >
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1E3A8A', marginBottom: '0.35rem' }}>
                  Secure Invitation Link (User Sets Own Password)
                </div>
                <p style={{ fontSize: '0.78rem', color: '#1E40AF', margin: '0 0 0.65rem 0' }}>
                  For security, Jobzy never generates, displays, or emails plaintext passwords. Share or open this verification link so the user can verify their email and set their own password:
                </p>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    readOnly
                    value={fullInviteUrl}
                    className="form-control"
                    style={{ flex: 1, fontSize: '0.8rem', fontFamily: 'monospace', background: '#FFFFFF' }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(fullInviteUrl);
                      setCopiedLink(true);
                      setTimeout(() => setCopiedLink(false), 2000);
                    }}
                    className="btn btn-secondary btn-sm"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                  >
                    {copiedLink ? <Check size={14} color="#16A34A" /> : <Copy size={14} />}
                    <span>{copiedLink ? 'Copied' : 'Copy Link'}</span>
                  </button>
                </div>
              </div>

              <div className="modal-footer" style={{ padding: '1rem 0 0 0', borderTop: 'none' }}>
                <button type="button" onClick={onClose} className="btn btn-primary">
                  Done
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              {error && (
                <div
                  style={{
                    background: '#FEF2F2',
                    border: '1px solid #FECACA',
                    color: '#991B1B',
                    padding: '0.75rem 1rem',
                    borderRadius: '8px',
                    fontSize: '0.85rem',
                    marginBottom: '1rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}
                >
                  <AlertTriangle size={16} />
                  <span>{error}</span>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.85rem' }}>
                <div className="form-group" style={{ marginBottom: '0.5rem' }}>
                  <label className="form-label">Full Name *</label>
                  <input
                    type="text"
                    className="form-control"
                    required
                    placeholder="e.g. Kasun Perera"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: '0.5rem' }}>
                  <label className="form-label">Email Address *</label>
                  <input
                    type="email"
                    className="form-control"
                    required
                    placeholder="e.g. kasun@example.lk"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: '0.5rem' }}>
                  <label className="form-label">Phone Number *</label>
                  <input
                    type="text"
                    className="form-control"
                    required
                    placeholder="e.g. +94 77 123 4567"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: '0.5rem' }}>
                  <label className="form-label">District *</label>
                  <select
                    className="form-control"
                    value={district}
                    onChange={(e) => setDistrict(e.target.value)}
                  >
                    {SRI_LANKA_DISTRICTS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: '0.5rem' }}>
                  <label className="form-label">City / Town</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Nugegoda"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: '0.5rem' }}>
                  <label className="form-label">Street Address (Optional)</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Street address"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                  />
                </div>
              </div>

              {role === 'provider' && (
                <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', color: '#475569', marginBottom: '0.65rem' }}>
                    Service Provider Profile Details
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.85rem' }}>
                    <div className="form-group" style={{ marginBottom: '0.5rem' }}>
                      <label className="form-label">Service Category *</label>
                      <select
                        className="form-control"
                        value={categoryId}
                        onChange={(e) => setCategoryId(e.target.value)}
                        required
                      >
                        {categories.map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group" style={{ marginBottom: '0.5rem' }}>
                      <label className="form-label">Professional Title *</label>
                      <input
                        type="text"
                        className="form-control"
                        required
                        placeholder="e.g. Licensed Domestic & Commercial Electrician"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                      />
                    </div>

                    <div className="form-group" style={{ marginBottom: '0.5rem' }}>
                      <label className="form-label">Experience (Years)</label>
                      <input
                        type="number"
                        min="0"
                        max="60"
                        className="form-control"
                        value={experienceYears}
                        onChange={(e) => setExperienceYears(e.target.value)}
                      />
                    </div>

                    <div className="form-group" style={{ marginBottom: '0.5rem' }}>
                      <label className="form-label">Pricing Model</label>
                      <select
                        className="form-control"
                        value={pricingType}
                        onChange={(e) => setPricingType(e.target.value)}
                      >
                        <option value="hourly">Hourly Rate</option>
                        <option value="fixed">Fixed Starting Rate</option>
                        <option value="quote">Custom Quote Only</option>
                      </select>
                    </div>

                    {pricingType !== 'quote' && (
                      <div className="form-group" style={{ marginBottom: '0.5rem' }}>
                        <label className="form-label">Base Rate (LKR)</label>
                        <input
                          type="number"
                          min="0"
                          step="50"
                          className="form-control"
                          value={baseRate}
                          onChange={(e) => setBaseRate(e.target.value)}
                        />
                      </div>
                    )}

                    {mode === 'add' && (
                      <div className="form-group" style={{ marginBottom: '0.5rem' }}>
                        <label className="form-label">Skills (Comma separated)</label>
                        <input
                          type="text"
                          className="form-control"
                          placeholder="e.g. Wiring, Panel Upgrades, Fault Finding"
                          value={skillsText}
                          onChange={(e) => setSkillsText(e.target.value)}
                        />
                      </div>
                    )}
                  </div>

                  <div className="form-group" style={{ marginTop: '0.5rem', marginBottom: '0.5rem' }}>
                    <label className="form-label">Professional Bio / Description</label>
                    <textarea
                      rows={2}
                      className="form-control"
                      placeholder="Brief summary of qualifications and services offered..."
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                    />
                  </div>

                  {mode === 'add' && (
                    <div
                      style={{
                        background: '#FFFBEB',
                        border: '1px solid #FDE68A',
                        borderRadius: '8px',
                        padding: '0.65rem 0.85rem',
                        fontSize: '0.78rem',
                        color: '#92400E',
                        marginTop: '0.5rem'
                      }}
                    >
                      <strong>Note:</strong> Creating a service provider account here generates a unique Registration ID (`JZ-SP-...`), keeps verification status as <strong>Pending Review</strong>, and does <strong>not</strong> mark registration or monthly subscription fees as paid.
                    </div>
                  )}
                </div>
              )}

              <div className="modal-footer" style={{ padding: '1rem 0 0 0', marginTop: '0.75rem' }}>
                <button type="button" onClick={onClose} className="btn btn-secondary" disabled={submitting}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting
                    ? 'Saving...'
                    : mode === 'add'
                    ? `Create ${role === 'customer' ? 'Customer' : 'Provider'} & Send Invite`
                    : 'Save Changes'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Suspend or Reactivate Account Modal (Requires a reason for suspension)
 */
export function SuspendAccountModal({
  isOpen,
  account,
  role, // 'customer' | 'provider'
  token,
  onClose,
  onSuccess
}) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setReason('');
      setError('');
    }
  }, [isOpen, account]);

  if (!isOpen || !account) return null;

  const currentStatus = role === 'provider' ? (account.user_status || account.status) : account.status;
  const isManuallySuspended =
    role === 'provider'
      ? Boolean(account.manual_suspended === 1 || (currentStatus === 'suspended' && account.suspension_type === 'manual'))
      : currentStatus === 'suspended';
  const isSuspending = !isManuallySuspended;
  const hasAutoSubSuspension =
    role === 'provider' &&
    Boolean(account.subscription_suspended === 1 || account.subscription_status === 'suspended_unpaid');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSuspending && !reason.trim()) {
      setError('Please enter a reason before suspending this account.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const endpoint =
        role === 'customer'
          ? `/api/admin/customers/${account.id}`
          : `/api/admin/providers/${account.id}`;

      const res = await fetch(endpoint, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          action: isSuspending ? 'suspend' : 'reactivate',
          status: isSuspending ? 'suspended' : 'active',
          reason: reason.trim()
        })
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to update account status.');
      } else {
        onSuccess();
        onClose();
      }
    } catch (err) {
      setError('Network error while updating account status.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: '520px', width: '100%' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            {isSuspending ? (
              <ShieldAlert size={22} color="#D97706" />
            ) : (
              <UserCheck size={22} color="#16A34A" />
            )}
            <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#0F172A' }}>
              {isSuspending ? 'Suspend Account' : 'Reactivate Account'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && (
              <div
                style={{
                  background: '#FEF2F2',
                  border: '1px solid #FECACA',
                  color: '#991B1B',
                  padding: '0.75rem 1rem',
                  borderRadius: '8px',
                  fontSize: '0.85rem',
                  marginBottom: '1rem'
                }}
              >
                {error}
              </div>
            )}

            <div
              style={{
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '8px',
                padding: '0.85rem 1rem',
                marginBottom: '1rem',
                fontSize: '0.85rem'
              }}
            >
              <div><strong>Account Name:</strong> {account.name}</div>
              <div><strong>Email:</strong> {account.email}</div>
              <div>
                <strong>Role:</strong>{' '}
                <span style={{ textTransform: 'capitalize' }}>
                  {role === 'provider' ? `Service Provider (${account.confirmation_id || 'Provider'})` : 'Customer'}
                </span>
              </div>
              {role === 'provider' && (
                <div style={{ marginTop: '0.35rem', paddingTop: '0.35rem', borderTop: '1px solid #E2E8F0', fontSize: '0.8rem' }}>
                  <div>
                    <strong>Current Suspension State:</strong>{' '}
                    {isManuallySuspended && hasAutoSubSuspension
                      ? 'Manual Suspension + Suspended — Unpaid Subscription'
                      : isManuallySuspended
                      ? 'Manual Administrator Suspension'
                      : hasAutoSubSuspension
                      ? 'Automatic (Suspended — Unpaid Subscription)'
                      : 'None (Active)'}
                  </div>
                  {isManuallySuspended && account.manual_suspension_reason && (
                    <div style={{ color: '#991B1B', marginTop: '0.2rem' }}>
                      <strong>Manual Reason:</strong> {account.manual_suspension_reason}
                      {account.manual_suspended_by_name ? ` (by ${account.manual_suspended_by_name})` : ''}
                      {account.manual_suspended_at ? ` on ${formatSriLankaDateTime(account.manual_suspended_at, true)}` : ''}
                    </div>
                  )}
                </div>
              )}
            </div>

            {isSuspending ? (
              <div
                style={{
                  background: '#FFFBEB',
                  border: '1px solid #FDE68A',
                  borderRadius: '8px',
                  padding: '0.75rem 0.9rem',
                  fontSize: '0.8rem',
                  color: '#92400E',
                  marginBottom: '1rem'
                }}
              >
                <strong>Effects of Manual Administrator Suspension:</strong>
                <ul style={{ margin: '0.35rem 0 0 1.1rem', padding: 0 }}>
                  <li>Revokes all active login sessions immediately and blocks login.</li>
                  <li>Prevents placing or receiving any new bookings.</li>
                  {role === 'provider' && (
                    <>
                      <li>Hides this provider profile from all public search listings.</li>
                      <li><strong>A subscription payment will not clear this manual suspension.</strong> Only an administrator can reactivate it.</li>
                    </>
                  )}
                  <li>Records the administrator, reason, and timestamp in the audit log and notifies the user.</li>
                </ul>
              </div>
            ) : (
              <div style={{ fontSize: '0.85rem', color: '#334155', marginBottom: '1rem' }}>
                <p style={{ margin: '0 0 0.5rem 0' }}>
                  Reactivating this account will remove the manual administrator suspension for <strong>{account.name}</strong>.
                </p>
                {role === 'provider' && (
                  <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '8px', padding: '0.65rem 0.85rem', fontSize: '0.78rem', color: '#1E40AF' }}>
                    <strong>Overdue Subscription Safeguard:</strong> Removing a manual suspension does <strong>not</strong> bypass overdue-payment restrictions.
                    {hasAutoSubSuspension
                      ? ' Because this provider also has an unpaid overdue subscription past the 5-day grace period, their account will remain "Suspended — Unpaid Subscription" until their subscription payment is verified.'
                      : ' Public listing visibility continues to require an approved application and active monthly subscription.'}
                  </div>
                )}
              </div>
            )}

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">
                {isSuspending ? 'Reason for Suspension (Required - Internal Audit Record) *' : 'Administrator Note (Optional)'}
              </label>
              <textarea
                rows={3}
                className="form-control"
                required={isSuspending}
                placeholder={
                  isSuspending
                    ? 'Specify why this account is being suspended (e.g. policy violation, repeated no-shows, disputed conduct)...'
                    : 'Optional note for the audit log...'
                }
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <div style={{ fontSize: '0.74rem', color: '#64748B', marginTop: '0.35rem' }}>
                The user will be notified of the status change without exposing internal administrator notes.
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" onClick={onClose} className="btn btn-secondary" disabled={submitting}>
              Cancel
            </button>
            <button
              type="submit"
              className={`btn ${isSuspending ? 'btn-danger' : 'btn-primary'}`}
              disabled={submitting}
            >
              {submitting
                ? 'Processing...'
                : isSuspending
                ? 'Confirm Suspension'
                : 'Reactivate Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Remove Account Confirmation Modal (Pre-check for active bookings, pending refunds, subscriptions)
 */
export function RemoveAccountModal({
  isOpen,
  account,
  role, // 'customer' | 'provider'
  token,
  onClose,
  onSuccess,
  onNavigateToTab
}) {
  const [precheckLoading, setPrecheckLoading] = useState(false);
  const [precheck, setPrecheck] = useState(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const dialogRef = useRef(null);
  const reasonTextareaRef = useRef(null);
  const closeButtonRef = useRef(null);
  const returnFocusRef = useRef(null);

  // Capture trigger element, lock background scroll, and manage initial/return focus
  useEffect(() => {
    if (!isOpen) return;

    returnFocusRef.current = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Move keyboard focus into the dialog once rendered
    const focusTimer = setTimeout(() => {
      if (reasonTextareaRef.current && !reasonTextareaRef.current.disabled) {
        reasonTextareaRef.current.focus();
      } else if (closeButtonRef.current) {
        closeButtonRef.current.focus();
      } else if (dialogRef.current) {
        dialogRef.current.focus();
      }
    }, 30);

    return () => {
      clearTimeout(focusTimer);
      document.body.style.overflow = prevOverflow;
      if (returnFocusRef.current && typeof returnFocusRef.current.focus === 'function') {
        try {
          returnFocusRef.current.focus();
        } catch (_) {}
      }
    };
  }, [isOpen]);

  // Escape key & Tab focus trap inside dialog
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (!submitting) {
          e.preventDefault();
          onClose();
        }
        return;
      }

      if (e.key === 'Tab' && dialogRef.current) {
        const focusableSelectors = [
          'button:not([disabled])',
          'textarea:not([disabled])',
          'input:not([disabled])',
          'select:not([disabled])',
          'a[href]',
          '[tabindex]:not([tabindex="-1"])'
        ].join(', ');
        const focusable = Array.from(dialogRef.current.querySelectorAll(focusableSelectors));
        if (focusable.length === 0) return;

        const firstEl = focusable[0];
        const lastEl = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstEl || !dialogRef.current.contains(document.activeElement)) {
            e.preventDefault();
            lastEl.focus();
          }
        } else {
          if (document.activeElement === lastEl || !dialogRef.current.contains(document.activeElement)) {
            e.preventDefault();
            firstEl.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, submitting, onClose]);

  // Load eligibility pre-check when opened
  useEffect(() => {
    if (!isOpen || !account) return;
    setReason('');
    setReasonError('');
    setError('');
    setPrecheck(null);

    const loadPrecheck = async () => {
      setPrecheckLoading(true);
      try {
        const endpoint =
          role === 'customer'
            ? `/api/admin/customers/${account.id}`
            : `/api/admin/providers/${account.id}`;
        const res = await fetch(endpoint, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setPrecheck(
            data.removalPrecheck || {
              canRemove: true,
              activeBookings: [],
              pendingRefunds: [],
              subscription: null
            }
          );
        } else {
          setError('Unable to verify account eligibility. Please try again.');
        }
      } catch (err) {
        console.error('Error loading removal precheck:', err);
        setError('Unable to check bookings, refunds and subscriptions.');
      } finally {
        setPrecheckLoading(false);
      }
    };

    loadPrecheck();
  }, [isOpen, account, role, token]);

  if (!isOpen || !account) return null;

  const activeBookings = precheck?.activeBookings || [];
  const pendingRefunds = precheck?.pendingRefunds || [];
  const subscription = precheck?.subscription || null;
  const hasBlockers = activeBookings.length > 0 || pendingRefunds.length > 0;
  const providerRegistrationId =
    role === 'provider'
      ? account.confirmation_id || account.confirmationId || 'Pending'
      : null;

  const handleRemove = async (e) => {
    e.preventDefault();
    if (submitting || precheckLoading) return;

    if (hasBlockers) {
      setError('Please resolve all active bookings and pending refunds before removing this account.');
      return;
    }

    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setReasonError('Please enter a reason for removing this account.');
      if (reasonTextareaRef.current) {
        reasonTextareaRef.current.focus();
      }
      return;
    }

    setReasonError('');
    setError('');
    setSubmitting(true);

    try {
      const endpoint =
        role === 'customer'
          ? `/api/admin/customers/${account.id}`
          : `/api/admin/providers/${account.id}`;

      const res = await fetch(endpoint, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          reason: trimmedReason,
          confirmed: true
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (Array.isArray(data.activeBookings) || Array.isArray(data.pendingRefunds)) {
          setPrecheck((prev) => ({
            ...(prev || {}),
            canRemove: false,
            activeBookings: data.activeBookings || prev?.activeBookings || [],
            pendingRefunds: data.pendingRefunds || prev?.pendingRefunds || []
          }));
        }
        setError(data.error || 'Failed to remove account. Please try again.');
      } else {
        onSuccess();
        onClose();
      }
    } catch (err) {
      setError('Network error while removing account. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      onClick={() => {
        if (!submitting) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="remove-account-dialog-title"
        aria-describedby="remove-account-dialog-subtitle"
        tabIndex={-1}
        className="remove-account-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Dialog Header (Fixed at top) */}
        <div
          className="modal-header"
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '16px',
            flexShrink: 0
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', minWidth: 0 }}>
            <div
              aria-hidden="true"
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: '#FEF2F2',
                border: '1px solid #FECACA',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                marginTop: '2px'
              }}
            >
              <Trash2 size={18} color="#DC2626" />
            </div>
            <div style={{ minWidth: 0 }}>
              <h2
                id="remove-account-dialog-title"
                style={{
                  margin: 0,
                  fontSize: '1.15rem',
                  fontWeight: 700,
                  color: '#0F172A',
                  lineHeight: 1.3
                }}
              >
                Remove account?
              </h2>
              <p
                id="remove-account-dialog-subtitle"
                style={{
                  margin: '4px 0 0 0',
                  fontSize: '0.85rem',
                  color: '#64748B',
                  lineHeight: 1.4
                }}
              >
                This account can be restored later.
              </p>
            </div>
          </div>

          <button
            ref={closeButtonRef}
            type="button"
            onClick={() => {
              if (!submitting) onClose();
            }}
            disabled={submitting}
            aria-label="Close dialog"
            style={{
              background: 'transparent',
              border: '1px solid transparent',
              borderRadius: '8px',
              padding: '6px',
              cursor: submitting ? 'not-allowed' : 'pointer',
              color: '#64748B',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Form wraps scrollable body + pinned footer */}
        <form
          onSubmit={handleRemove}
          noValidate
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: '1 1 auto',
            minHeight: 0,
            overflow: 'hidden'
          }}
        >
          {/* Scrollable Content Area */}
          <div
            className="modal-body"
            style={{
              padding: '20px 24px',
              overflowY: 'auto',
              overflowX: 'hidden',
              flex: '1 1 auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px'
            }}
          >
            {error && (
              <div
                role="alert"
                style={{
                  background: '#FEF2F2',
                  border: '1px solid #FECACA',
                  color: '#991B1B',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  fontSize: '0.85rem',
                  lineHeight: 1.45,
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  overflowWrap: 'anywhere',
                  wordBreak: 'break-word'
                }}
              >
                <AlertTriangle size={17} style={{ flexShrink: 0, marginTop: '2px', color: '#DC2626' }} />
                <span>{error}</span>
              </div>
            )}

            {/* Account Details Compact Panel (Separate Labelled Fields) */}
            <div
              style={{
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '12px',
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px'
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748B' }}>
                  Account name
                </span>
                <span
                  style={{
                    fontSize: '0.92rem',
                    fontWeight: 700,
                    color: '#0F172A',
                    overflowWrap: 'anywhere',
                    wordBreak: 'break-word'
                  }}
                >
                  {account.name}
                </span>
              </div>

              <div style={{ height: '1px', background: '#E2E8F0' }} />

              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748B' }}>
                  Email address
                </span>
                <span
                  style={{
                    fontSize: '0.88rem',
                    fontWeight: 600,
                    color: '#1E293B',
                    overflowWrap: 'anywhere',
                    wordBreak: 'break-word'
                  }}
                >
                  {account.email}
                </span>
              </div>

              <div style={{ height: '1px', background: '#E2E8F0' }} />

              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748B' }}>
                  Account type
                </span>
                <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#1E293B' }}>
                  {role === 'provider' ? 'Service Provider' : 'Customer'}
                </span>
              </div>

              {role === 'provider' && (
                <>
                  <div style={{ height: '1px', background: '#E2E8F0' }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748B' }}>
                      Provider registration ID
                    </span>
                    <span
                      style={{
                        fontSize: '0.86rem',
                        fontWeight: 700,
                        fontFamily: 'monospace',
                        color: '#1E40AF',
                        overflowWrap: 'anywhere',
                        wordBreak: 'break-word'
                      }}
                    >
                      {providerRegistrationId}
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* Eligibility Status */}
            <div aria-live="polite">
              {precheckLoading ? (
                <div
                  style={{
                    background: '#F8FAFC',
                    border: '1px solid #CBD5E1',
                    borderRadius: '10px',
                    padding: '12px 14px',
                    fontSize: '0.85rem',
                    color: '#475569',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px'
                  }}
                >
                  <span
                    className="spinner"
                    style={{ width: '16px', height: '16px', borderWidth: '2px', flexShrink: 0 }}
                    aria-hidden="true"
                  />
                  <span>Checking bookings, refunds and subscriptions…</span>
                </div>
              ) : hasBlockers ? (
                <div
                  style={{
                    background: '#FEF2F2',
                    border: '1px solid #FCA5A5',
                    borderRadius: '10px',
                    padding: '14px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px'
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      color: '#991B1B',
                      fontWeight: 700,
                      fontSize: '0.88rem'
                    }}
                  >
                    <AlertTriangle size={16} style={{ flexShrink: 0, color: '#DC2626' }} />
                    <span>Resolve the following issues before removing this account:</span>
                  </div>

                  {activeBookings.length > 0 && (
                    <div style={{ fontSize: '0.82rem', color: '#7F1D1D', lineHeight: 1.45 }}>
                      <div style={{ fontWeight: 700, marginBottom: '4px' }}>
                        Active bookings ({activeBookings.length}):
                      </div>
                      <ul style={{ margin: '0 0 6px 18px', padding: 0 }}>
                        {activeBookings.slice(0, 4).map((b) => (
                          <li key={b.id} style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                            #{b.booking_number} — {b.service_title} ({b.status.replace(/_/g, ' ')})
                          </li>
                        ))}
                      </ul>
                      {onNavigateToTab && (
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onNavigateToTab('bookings');
                          }}
                          style={{
                            background: '#FFFFFF',
                            border: '1px solid #FCA5A5',
                            color: '#991B1B',
                            borderRadius: '6px',
                            padding: '5px 10px',
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <span>View active bookings</span>
                          <ExternalLink size={12} />
                        </button>
                      )}
                    </div>
                  )}

                  {pendingRefunds.length > 0 && (
                    <div style={{ fontSize: '0.82rem', color: '#7F1D1D', lineHeight: 1.45 }}>
                      <div style={{ fontWeight: 700, marginBottom: '4px' }}>
                        Pending refunds ({pendingRefunds.length}):
                      </div>
                      <ul style={{ margin: '0 0 6px 18px', padding: 0 }}>
                        {pendingRefunds.slice(0, 4).map((b) => (
                          <li key={b.id} style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                            #{b.booking_number} — LKR {(b.booking_fee_amount || 0).toLocaleString()} booking fee on {b.status} booking
                          </li>
                        ))}
                      </ul>
                      {onNavigateToTab && (
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onNavigateToTab('payments');
                          }}
                          style={{
                            background: '#FFFFFF',
                            border: '1px solid #FCA5A5',
                            color: '#991B1B',
                            borderRadius: '6px',
                            padding: '5px 10px',
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <span>View pending refunds</span>
                          <ExternalLink size={12} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div
                    style={{
                      background: '#F0FDF4',
                      border: '1px solid #BBF7D0',
                      borderRadius: '10px',
                      padding: '10px 14px',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      color: '#166534',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    <CheckCircle2 size={17} style={{ flexShrink: 0, color: '#16A34A' }} />
                    <span>This account is ready for removal.</span>
                  </div>

                  {role === 'provider' &&
                    subscription &&
                    (subscription.status === 'active' || subscription.auto_renew === 1) && (
                      <div
                        style={{
                          background: '#EFF6FF',
                          border: '1px solid #BFDBFE',
                          borderRadius: '10px',
                          padding: '10px 14px',
                          fontSize: '0.8rem',
                          color: '#1E40AF',
                          lineHeight: 1.45
                        }}
                      >
                        Active provider subscription detected. Future automatic subscription charges will be cancelled upon removal.
                      </div>
                    )}
                </div>
              )}
            </div>

            {/* Removal Explanation Panel */}
            <div
              style={{
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '10px',
                padding: '14px 16px',
                fontSize: '0.84rem',
                color: '#334155',
                lineHeight: 1.5
              }}
            >
              <div style={{ fontWeight: 700, color: '#0F172A', marginBottom: '6px' }}>
                Removing this account will:
              </div>
              <ul style={{ margin: '0 0 10px 18px', padding: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <li>Disable login and end active sessions.</li>
                <li>Remove it from active account lists.</li>
                <li>Hide its provider profile, if applicable.</li>
              </ul>
              <p style={{ margin: 0, fontSize: '0.82rem', color: '#475569' }}>
                Bookings, payment records and audit history will be preserved. You can restore the account from Removed Accounts.
              </p>
            </div>

            {/* Required Reason Textarea */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label
                htmlFor="remove-account-reason"
                style={{
                  fontSize: '0.875rem',
                  fontWeight: 700,
                  color: '#0F172A'
                }}
              >
                Reason for removal
              </label>
              <div
                id="remove-account-reason-help"
                style={{
                  fontSize: '0.78rem',
                  color: '#64748B',
                  marginTop: '-2px'
                }}
              >
                Required. Saved in the internal administrator audit log.
              </div>
              <textarea
                ref={reasonTextareaRef}
                id="remove-account-reason"
                rows={3}
                className="form-control"
                disabled={precheckLoading || hasBlockers || submitting}
                placeholder="Explain why this account is being removed."
                value={reason}
                aria-required="true"
                aria-invalid={Boolean(reasonError)}
                aria-describedby={
                  reasonError
                    ? 'remove-account-reason-help remove-account-reason-error'
                    : 'remove-account-reason-help'
                }
                onChange={(e) => {
                  setReason(e.target.value);
                  if (reasonError && e.target.value.trim()) {
                    setReasonError('');
                  }
                }}
                onBlur={() => {
                  if (reason.length > 0 && !reason.trim()) {
                    setReasonError('Reason for removal cannot be empty or whitespace only.');
                  }
                }}
                style={{
                  minHeight: '84px',
                  lineHeight: 1.5,
                  borderColor: reasonError ? '#DC2626' : undefined
                }}
              />
              {reasonError && (
                <div
                  id="remove-account-reason-error"
                  role="alert"
                  style={{
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: '#DC2626',
                    marginTop: '2px'
                  }}
                >
                  {reasonError}
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons Footer (Pinned at bottom) */}
          <div
            className="modal-footer"
            style={{
              padding: '16px 24px',
              borderTop: '1px solid #E2E8F0',
              background: '#F8FAFC',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '12px',
              flexShrink: 0
            }}
          >
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
              disabled={submitting}
              style={{
                background: '#FFFFFF',
                color: '#334155',
                border: '1px solid #CBD5E1'
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-danger"
              disabled={submitting || precheckLoading || hasBlockers}
              style={{
                background: '#DC2626',
                borderColor: '#DC2626',
                color: '#FFFFFF'
              }}
            >
              {submitting ? 'Removing…' : 'Remove Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
