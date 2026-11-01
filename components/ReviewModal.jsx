'use client';
import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { X, Star, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function ReviewModal({ isOpen, onClose, booking, onReviewSuccess }) {
  const { token } = useAuth();
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen || !booking) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reviewText.trim()) {
      setError('Please provide feedback about the completed service.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          bookingId: booking.id,
          rating,
          reviewText: reviewText.trim()
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit review.');
      }

      if (onReviewSuccess) onReviewSuccess(data);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
        <div className="modal-header">
          <div>
            <h3 style={{ fontSize: '1.2rem', color: '#0F172A' }}>
              Rate & Review {booking.provider_name}
            </h3>
            <p style={{ fontSize: '0.8rem', color: '#64748B' }}>
              Booking #{booking.booking_number} &bull; {booking.service_title}
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

            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '0.5rem' }}>
                How would you rate the overall service?
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem' }}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.2rem' }}
                  >
                    <Star
                      size={32}
                      fill={(hoverRating || rating) >= star ? '#F59E0B' : 'transparent'}
                      color={(hoverRating || rating) >= star ? '#F59E0B' : '#CBD5E1'}
                    />
                  </button>
                ))}
              </div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0F172A', marginTop: '0.4rem' }}>
                {rating === 5 && 'Outstanding Experience (5 / 5)'}
                {rating === 4 && 'Very Good Quality (4 / 5)'}
                {rating === 3 && 'Average Service (3 / 5)'}
                {rating === 2 && 'Needs Improvement (2 / 5)'}
                {rating === 1 && 'Unsatisfactory (1 / 5)'}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">
                Your Honest Feedback & Review <span style={{ color: '#DC2626' }}>*</span>
              </label>
              <textarea
                required
                rows={4}
                className="form-control"
                placeholder="Share your experience (punctuality, quality of workmanship, pricing fairness, tidiness)..."
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
              />
            </div>

            <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
              <strong>Policy:</strong> Exactly 1 review is permitted per completed booking. Your rating directly updates the provider's official Jobzy score.
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="btn btn-primary">
              {loading ? 'Submitting...' : 'Publish Customer Review'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
