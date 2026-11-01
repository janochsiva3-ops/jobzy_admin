'use client';
import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { X, DollarSign, FileText, Calendar, AlertCircle } from 'lucide-react';

export default function QuoteResponseModal({ isOpen, onClose, booking, onQuoteSuccess }) {
  const { token } = useAuth();
  const [quoteAmount, setQuoteAmount] = useState('');
  const [quoteBreakdown, setQuoteBreakdown] = useState('');
  const [estimatedDays, setEstimatedDays] = useState('2 business days');
  const [validUntil, setValidUntil] = useState('14 days from issue');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen || !booking) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!quoteAmount || parseFloat(quoteAmount) <= 0) {
      setError('Please provide a valid quotation amount in LKR.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/bookings/${booking.id}/respond`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'submit_quote',
          quoteAmount: parseFloat(quoteAmount),
          quoteBreakdown: quoteBreakdown.trim(),
          estimatedDays,
          validUntil
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit quotation.');
      }

      if (onQuoteSuccess) onQuoteSuccess(data);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '540px' }}>
        <div className="modal-header">
          <div>
            <h3 style={{ fontSize: '1.2rem', color: '#0F172A' }}>
              Prepare Quotation for Booking #{booking.booking_number}
            </h3>
            <p style={{ fontSize: '0.8rem', color: '#64748B' }}>
              Customer: {booking.customer_name} &bull; {booking.city || booking.district}
            </p>
          </div>
          <button onClick={onClose} className="btn-icon" style={{ color: '#64748B' }}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
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

            {/* Task summary box */}
            <div style={{
              background: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: '8px',
              padding: '0.75rem 1rem',
              marginBottom: '1.25rem'
            }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                Customer Task Description:
              </div>
              <div style={{ fontSize: '0.85rem', color: '#1E293B', marginTop: '0.25rem' }}>
                {booking.task_description}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">
                Total Quotation Amount (LKR) <span style={{ color: '#DC2626' }}>*</span>
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', fontWeight: 700, color: '#64748B' }}>
                  Rs.
                </span>
                <input 
                  type="number"
                  required
                  min="500"
                  step="100"
                  className="form-control"
                  style={{ paddingLeft: '3rem', fontSize: '1.1rem', fontWeight: 700 }}
                  placeholder="e.g. 18500"
                  value={quoteAmount}
                  onChange={(e) => setQuoteAmount(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">
                Cost Breakdown & Inclusions <span style={{ color: '#DC2626' }}>*</span>
              </label>
              <textarea 
                required
                rows={3}
                className="form-control"
                placeholder="Itemize materials, specialized hardware, artisan labor, and transport (e.g. Teak timber: Rs. 11,500; Hinges: Rs. 3,000; Installation: Rs. 4,000)..."
                value={quoteBreakdown}
                onChange={(e) => setQuoteBreakdown(e.target.value)}
              />
            </div>

            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Estimated Duration</label>
                <input 
                  type="text"
                  className="form-control"
                  placeholder="e.g. 3 business days"
                  value={estimatedDays}
                  onChange={(e) => setEstimatedDays(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Quotation Validity</label>
                <input 
                  type="text"
                  className="form-control"
                  placeholder="e.g. 14 days"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                />
              </div>
            </div>

            <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
              <strong>Workflow Note:</strong> Once submitted, the booking will transition to <em>Awaiting Quote Approval</em>. The booking will become <em>Confirmed</em> only when the customer accepts this quotation.
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="btn btn-primary">
              {loading ? 'Submitting...' : 'Dispatch Formal Quotation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
