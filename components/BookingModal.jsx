'use client';
import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { SRI_LANKA_DISTRICTS, TIME_SLOTS } from '@/lib/sriLankaData';
import { X, AlertCircle, CheckCircle2, ShieldCheck, Info, CreditCard } from 'lucide-react';
import CheckoutModal from './CheckoutModal';

export default function BookingModal({ provider, isOpen, onClose, onBookingSuccess }) {
  const { user, token, openAuth } = useAuth();

  const [taskDescription, setTaskDescription] = useState('');
  const [serviceLocationType, setServiceLocationType] = useState('in_person');
  const [address, setAddress] = useState('');
  const [district, setDistrict] = useState('Colombo');
  const [city, setCity] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTimeSlot, setScheduledTimeSlot] = useState(TIME_SLOTS[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Step tracking: 'form' | 'checkout' | 'done'
  const [step, setStep] = useState('form');
  const [bookingRef, setBookingRef] = useState('');
  const [createdBookingId, setCreatedBookingId] = useState(null);
  const [platformFee, setPlatformFee] = useState(null);
  const [showCheckout, setShowCheckout] = useState(false);

  // Populate user defaults
  useEffect(() => {
    if (user) {
      setAddress(user.address || '');
      setDistrict(user.district || provider?.district || 'Colombo');
      setCity(user.city || '');
    }
  }, [user, provider]);

  // Fetch customer booking platform fee on open
  useEffect(() => {
    if (!isOpen) return;
    async function loadFee() {
      try {
        const res = await fetch('/api/payments/fees');
        if (res.ok) {
          const data = await res.json();
          const bf = (data.fees || []).find(f => f.fee_type === 'customer_booking');
          if (bf) setPlatformFee(bf.amount);
        }
      } catch {}
    }
    loadFee();
    // Reset state on open
    setStep('form');
    setError(null);
    setBookingRef('');
    setCreatedBookingId(null);
    setShowCheckout(false);
  }, [isOpen]);

  if (!isOpen || !provider) return null;

  const isQuoteMode = provider.pricing_type === 'quote';

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = tomorrow.toISOString().split('T')[0];

  // Step 1: Submit booking (creates awaiting_payment record)
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) { openAuth('login'); return; }
    if (user.role !== 'customer') {
      setError('Only customer accounts can place booking requests.');
      return;
    }
    if (!scheduledDate) { setError('Please select a preferred booking date.'); return; }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          providerId: provider.id,
          serviceCategory: provider.category_name || provider.title,
          serviceTitle: provider.title,
          taskDescription,
          serviceLocationType,
          address: serviceLocationType === 'online' ? 'Online Session (Zoom / Google Meet)' : address,
          district,
          city,
          scheduledDate,
          scheduledTimeSlot
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Booking request failed.');

      setBookingRef(data.bookingNumber);
      setCreatedBookingId(data.bookingId || data.id);

      // If payment is required, open checkout; otherwise done
      if (data.requiresPayment || data.status === 'awaiting_payment') {
        setStep('checkout');
        setShowCheckout(true);
      } else {
        setStep('done');
        if (onBookingSuccess) onBookingSuccess(data);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentSuccess = (result) => {
    setShowCheckout(false);
    setStep('done');
    if (onBookingSuccess) onBookingSuccess({ bookingNumber: bookingRef, ...result });
  };

  return (
    <>
      <div className="modal-backdrop" onClick={step === 'form' ? onClose : undefined}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '620px' }}>
          <div className="modal-header">
            <div>
              <h3 style={{ fontSize: '1.25rem', color: '#0F172A' }}>
                {step === 'checkout' ? `Pay Platform Fee — Booking #${bookingRef}` : `Request Booking with ${provider.name}`}
              </h3>
              <p style={{ fontSize: '0.85rem', color: '#64748B' }}>
                {provider.title} &bull; {provider.category_name}
              </p>
            </div>
            <button onClick={onClose} className="btn-icon" style={{ color: '#64748B' }}>
              <X size={20} />
            </button>
          </div>

          <div className="modal-body">
            {/* ── DONE STATE ── */}
            {step === 'done' ? (
              <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                <div style={{ width: '4rem', height: '4rem', background: '#D1FAE5', color: '#059669', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem auto' }}>
                  <CheckCircle2 size={36} />
                </div>
                <h3 style={{ fontSize: '1.4rem', color: '#0F172A', marginBottom: '0.5rem' }}>
                  Booking Fee Verified — Request Submitted!
                </h3>
                <p style={{ fontSize: '1rem', color: '#334155', fontWeight: 700, marginBottom: '0.5rem' }}>
                  Reference: <span style={{ color: '#1D4ED8' }}>#{bookingRef}</span>
                </p>
                <div style={{ display: 'inline-block', padding: '0.25rem 0.75rem', background: '#DBEAFE', color: '#1E40AF', borderRadius: '9999px', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.85rem' }}>
                  Status: Pending Provider Acceptance
                </div>
                <p style={{ fontSize: '0.88rem', color: '#64748B', maxWidth: '460px', margin: '0 auto 1.75rem auto', lineHeight: 1.5 }}>
                  {isQuoteMode
                    ? 'Your booking fee is verified and your task details have been sent to the provider. Note: Payment enables the request to proceed; the provider will review and submit a quotation.'
                    : `Your booking fee is verified and your request for ${scheduledDate} (${scheduledTimeSlot}) has been sent to the provider for acceptance. Payment enables your request to proceed and does not automatically confirm provider availability.`}
                </p>
                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                  <a href="/customer/dashboard" className="btn btn-primary">View in Dashboard</a>
                  <button onClick={onClose} className="btn btn-secondary">Close</button>
                </div>
              </div>
            ) : step === 'checkout' ? (
              /* ── CHECKOUT SUMMARY (Awaiting Booking Fee Payment) ── */
              <div style={{ textAlign: 'center', padding: '1.5rem 1rem' }}>
                <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '10px', padding: '1rem', marginBottom: '1.25rem' }}>
                  <div style={{ display: 'inline-block', padding: '0.2rem 0.65rem', background: '#FEF3C7', color: '#92400E', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                    Status: Awaiting Booking Fee Payment
                  </div>
                  <p style={{ fontSize: '0.88rem', color: '#78350F', fontWeight: 600, margin: '0 0 0.35rem' }}>
                    Booking #{bookingRef} has been created and saved.
                  </p>
                  <p style={{ fontSize: '0.8rem', color: '#92400E', margin: 0, lineHeight: 1.45 }}>
                    This booking will not be submitted to the provider until the platform booking fee is verified. Payment enables your request to proceed to <strong>Pending Provider Acceptance</strong>; it does not automatically confirm provider availability.
                  </p>
                </div>
                <button
                  className="btn btn-primary"
                  style={{ width: '100%', gap: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  onClick={() => setShowCheckout(true)}
                >
                  <CreditCard size={16} />
                  {platformFee ? `Pay Booking Fee — LKR ${platformFee.toLocaleString()}` : 'Pay Booking Fee'}
                </button>
                <p style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '0.75rem' }}>
                  <ShieldCheck size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '3px', color: '#059669' }} />
                  You can also complete this payment anytime from your Customer Dashboard under My Bookings.
                </p>
              </div>
            ) : (
              /* ── BOOKING FORM ── */
              <form onSubmit={handleSubmit}>
                {error && (
                  <div style={{ background: '#FEE2E2', color: '#B91C1C', padding: '0.75rem', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <AlertCircle size={16} />
                    <span>{error}</span>
                  </div>
                )}

                {/* Provider Rate + Platform Fee Breakdown */}
                <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '10px', padding: '0.85rem 1rem', marginBottom: '1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#1E40AF', textTransform: 'uppercase' }}>Provider Rate:</span>
                      <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0F3866' }}>
                        {provider.pricing_type === 'hourly' && `LKR ${provider.base_rate?.toLocaleString()} / hour`}
                        {provider.pricing_type === 'fixed' && `LKR ${provider.base_rate?.toLocaleString()} (Fixed)`}
                        {provider.pricing_type === 'quote' && 'Formal Quotation Required'}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: '#3B82F6' }}>Paid directly to provider upon job completion</div>
                    </div>
                    {platformFee && (
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#0F766E', textTransform: 'uppercase' }}>Jobzy Platform Fee:</span>
                        <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0F766E' }}>LKR {platformFee.toLocaleString()}</div>
                        <div style={{ fontSize: '0.7rem', color: '#64748B' }}>Refunded if provider declines</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Task Description */}
                <div className="form-group">
                  <label className="form-label">What work needs to be done? <span style={{ color: '#DC2626' }}>*</span></label>
                  <textarea
                    required
                    rows={3}
                    className="form-control"
                    placeholder="Describe your requirement in detail (e.g., room size, issue encountered, materials required)..."
                    value={taskDescription}
                    onChange={(e) => setTaskDescription(e.target.value)}
                  />
                </div>

                {/* Service Location Type */}
                <div className="form-group">
                  <label className="form-label">Service Format</label>
                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem', cursor: 'pointer' }}>
                      <input type="radio" name="locationType" value="in_person" checked={serviceLocationType === 'in_person'} onChange={() => setServiceLocationType('in_person')} />
                      <span>At My Location (In-Person Visit)</span>
                    </label>
                    {provider.category_slug === 'teachers-and-tutors' && (
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem', cursor: 'pointer' }}>
                        <input type="radio" name="locationType" value="online" checked={serviceLocationType === 'online'} onChange={() => setServiceLocationType('online')} />
                        <span>Online Session (Zoom / Meet)</span>
                      </label>
                    )}
                  </div>
                </div>

                {/* Address details if in-person */}
                {serviceLocationType === 'in_person' && (
                  <>
                    <div className="grid-2">
                      <div className="form-group">
                        <label className="form-label">District</label>
                        <select className="form-control" value={district} onChange={(e) => setDistrict(e.target.value)}>
                          {SRI_LANKA_DISTRICTS.map((d) => (<option key={d} value={d}>{d}</option>))}
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label">City / Town</label>
                        <input type="text" required className="form-control" placeholder="e.g. Nawala, Rajagiriya" value={city} onChange={(e) => setCity(e.target.value)} />
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Street Address / Landmark</label>
                      <input type="text" required className="form-control" placeholder="e.g. 45/2 School Lane, near Commercial Bank" value={address} onChange={(e) => setAddress(e.target.value)} />
                    </div>
                  </>
                )}

                {/* Date & Time Slot */}
                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">Preferred Date <span style={{ color: '#DC2626' }}>*</span></label>
                    <input type="date" required min={minDate} className="form-control" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Preferred Time Slot <span style={{ color: '#DC2626' }}>*</span></label>
                    <select className="form-control" value={scheduledTimeSlot} onChange={(e) => setScheduledTimeSlot(e.target.value)}>
                      {TIME_SLOTS.map((slot) => (<option key={slot} value={slot}>{slot}</option>))}
                    </select>
                  </div>
                </div>

                {/* Schedule + fee notice */}
                <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '0.75rem', fontSize: '0.8rem', color: '#64748B', marginBottom: '1.25rem', display: 'flex', gap: '0.5rem' }}>
                  <Info size={18} color="#0F4C81" style={{ flexShrink: 0 }} />
                  <span>
                    <strong>Booking Fee Notice:</strong> A small Jobzy platform fee (LKR {platformFee?.toLocaleString() || '…'}) is collected when you submit. This is separate from the provider's charge and is refunded automatically if declined.
                  </span>
                </div>

                <div className="modal-footer" style={{ margin: '0 -1.5rem -1.5rem -1.5rem' }}>
                  <button type="button" onClick={onClose} className="btn btn-secondary">Cancel</button>
                  <button type="submit" disabled={loading} className="btn btn-primary">
                    {loading ? 'Creating Request…' : (isQuoteMode ? 'Request Quotation & Pay Fee' : 'Continue to Payment')}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* Platform Booking Fee Checkout */}
      {showCheckout && createdBookingId && (
        <CheckoutModal
          isOpen={showCheckout}
          onClose={() => {
            setShowCheckout(false);
          }}
          feeType="customer_booking"
          relatedId={createdBookingId}
          title="Customer Platform Booking Request Fee"
          subtitle={`Booking #${bookingRef} with ${provider?.name} — ${scheduledDate}`}
          providerName={provider?.name}
          providerRateInfo={
            provider?.pricing_type === 'hourly' ? `LKR ${provider.base_rate?.toLocaleString()} / hr (paid to provider on completion)`
            : provider?.pricing_type === 'fixed' ? `LKR ${provider.base_rate?.toLocaleString()} fixed (paid to provider on completion)`
            : 'Provider will submit a quotation'
          }
          onSuccess={handlePaymentSuccess}
        />
      )}
    </>
  );
}
