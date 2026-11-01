'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { X, Printer, ArrowDownCircle, ShieldCheck } from 'lucide-react';

export default function ReceiptModal({ isOpen, onClose, transactionId }) {
  const { token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen || !transactionId) {
      setReceipt(null);
      setError(null);
      return;
    }

    async function fetchReceipt() {
      setLoading(true);
      setError(null);
      try {
        const activeToken = token || (typeof window !== 'undefined' ? localStorage.getItem('jobzy_token') : '');
        const res = await fetch(`/api/payments/receipts/${transactionId}`, {
          headers: activeToken ? { Authorization: `Bearer ${activeToken}` } : {}
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Failed to load receipt details.');
        }
        setReceipt(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchReceipt();
  }, [isOpen, transactionId, token]);

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 1100 }}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '640px', width: '100%', borderRadius: '16px', overflow: 'hidden' }}
      >
        {/* Top Action Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.9rem 1.5rem',
            background: '#F8FAFC',
            borderBottom: '1px solid #E2E8F0'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: '#10B981',
                display: 'inline-block'
              }}
            />
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                color: '#475569',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}
            >
              Verified Official Receipt
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={handlePrint}
              className="btn btn-secondary btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem' }}
            >
              <Printer size={14} />
              <span>Print / Save PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="btn-icon"
              style={{ color: '#64748B' }}
              aria-label="Close receipt"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Receipt Body */}
        <div className="modal-body" style={{ padding: '1.75rem' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#64748B' }}>
              <div className="spinner" style={{ margin: '0 auto 0.75rem' }} />
              <p style={{ fontSize: '0.88rem' }}>Loading receipt details...</p>
            </div>
          ) : error ? (
            <div
              style={{
                padding: '1rem',
                background: '#FEE2E2',
                border: '1px solid #FCA5A5',
                borderRadius: '10px',
                color: '#B91C1C',
                fontSize: '0.85rem',
                textAlign: 'center'
              }}
            >
              {error}
            </div>
          ) : receipt ? (
            <div id="jobzy-printable-receipt" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Receipt Header */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  flexWrap: 'wrap',
                  gap: '1rem',
                  paddingBottom: '1.25rem',
                  borderBottom: '1px solid #E2E8F0'
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.45rem', fontWeight: 800, color: '#142D4E' }}>
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '8px',
                        background: '#0F766E',
                        color: '#FFFFFF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 900,
                        fontSize: '0.95rem'
                      }}
                    >
                      J
                    </div>
                    <span>
                      Job<span style={{ color: '#FF7A00' }}>Z</span>y
                    </span>
                  </div>
                  <p style={{ fontSize: '0.78rem', color: '#64748B', margin: '0.25rem 0 0' }}>
                    {receipt.issuer?.name || 'Sri Lanka’s Trusted Skilled Service Marketplace'}
                  </p>
                  <p style={{ fontSize: '0.72rem', color: '#94A3B8', margin: '0.1rem 0 0' }}>
                    {receipt.issuer?.address || 'Colombo, Sri Lanka'} &bull; {receipt.issuer?.supportEmail || 'support@jobzy.lk'}
                  </p>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '0.25rem 0.65rem',
                      fontSize: '0.7rem',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      borderRadius: '6px',
                      marginBottom: '0.35rem',
                      background: receipt.status === 'refunded' ? '#FEF3C7' : '#DCFCE7',
                      color: receipt.status === 'refunded' ? '#92400E' : '#166534',
                      border: `1px solid ${receipt.status === 'refunded' ? '#FDE68A' : '#86EFAC'}`
                    }}
                  >
                    {receipt.status === 'refunded' ? 'REFUNDED' : 'PAYMENT COMPLETED'}
                  </span>
                  <div style={{ fontSize: '0.72rem', color: '#64748B' }}>Receipt Ref:</div>
                  <div style={{ fontSize: '0.9rem', fontFamily: 'monospace', fontWeight: 800, color: '#0F172A' }}>
                    {receipt.receiptNumber}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '0.15rem' }}>
                    {receipt.date ? new Date(receipt.date).toLocaleString('en-LK') : ''}
                  </div>
                </div>
              </div>

              {/* Payer & Transaction Summary */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: '1rem',
                  background: '#F8FAFC',
                  padding: '1rem',
                  borderRadius: '10px',
                  border: '1px solid #E2E8F0',
                  fontSize: '0.8rem'
                }}
              >
                <div>
                  <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', color: '#94A3B8' }}>
                    Billed To
                  </div>
                  <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0F172A', marginTop: '0.2rem' }}>
                    {receipt.payer?.name || 'Valued User'}
                  </div>
                  <div style={{ color: '#475569' }}>{receipt.payer?.email}</div>
                  {receipt.payer?.phone && <div style={{ color: '#64748B' }}>{receipt.payer.phone}</div>}
                  {receipt.payer?.district && (
                    <div style={{ color: '#64748B' }}>
                      {receipt.payer.city ? `${receipt.payer.city}, ` : ''}
                      {receipt.payer.district}
                    </div>
                  )}
                </div>

                <div>
                  <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', color: '#94A3B8' }}>
                    Transaction Summary
                  </div>
                  <div style={{ color: '#334155', marginTop: '0.2rem', fontWeight: 600 }}>
                    Txn ID: <span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#0F172A' }}>{receipt.transactionReference}</span>
                  </div>
                  <div style={{ color: '#475569' }}>Method: {receipt.paymentMethod}</div>
                  {receipt.gatewayReference && (
                    <div style={{ color: '#64748B', fontFamily: 'monospace', fontSize: '0.74rem' }}>
                      Gateway Ref: {receipt.gatewayReference}
                    </div>
                  )}
                  {receipt.relatedDetails?.confirmation_id && (
                    <div style={{ color: '#0F766E', fontWeight: 700, fontSize: '0.76rem', marginTop: '0.2rem' }}>
                      Provider Reg ID: {receipt.relatedDetails.confirmation_id}
                    </div>
                  )}
                  {receipt.relatedDetails?.booking_number && (
                    <div style={{ color: '#0F766E', fontWeight: 700, fontSize: '0.76rem', marginTop: '0.2rem' }}>
                      Booking Ref: #{receipt.relatedDetails.booking_number}
                    </div>
                  )}
                </div>
              </div>

              {/* Itemized Table */}
              <div style={{ border: '1px solid #E2E8F0', borderRadius: '10px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                  <thead style={{ background: '#F1F5F9', borderBottom: '1px solid #E2E8F0' }}>
                    <tr>
                      <th style={{ padding: '0.7rem 1rem', textAlign: 'left', color: '#475569', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase' }}>
                        Item &amp; Description
                      </th>
                      <th style={{ padding: '0.7rem 1rem', textAlign: 'center', color: '#475569', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase' }}>
                        Currency
                      </th>
                      <th style={{ padding: '0.7rem 1rem', textAlign: 'right', color: '#475569', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase' }}>
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <div style={{ fontWeight: 700, color: '#0F172A' }}>{receipt.feeTitle}</div>
                        {receipt.relatedDetails?.service_title && (
                          <div style={{ color: '#64748B', fontSize: '0.75rem', marginTop: '0.15rem' }}>
                            Service: {receipt.relatedDetails.service_title} ({receipt.relatedDetails.provider_name})
                          </div>
                        )}
                        {receipt.relatedDetails?.current_period_start && (
                          <div style={{ color: '#0F766E', fontSize: '0.75rem', marginTop: '0.15rem', fontWeight: 600 }}>
                            Active Period: {receipt.relatedDetails.current_period_start.split('T')[0]} to{' '}
                            {receipt.relatedDetails.current_period_end?.split('T')[0]}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '0.85rem 1rem', textAlign: 'center', fontFamily: 'monospace', color: '#475569' }}>
                        {receipt.currency || 'LKR'}
                      </td>
                      <td style={{ padding: '0.85rem 1rem', textAlign: 'right', fontWeight: 800, color: '#0F172A' }}>
                        LKR {parseFloat(receipt.amount || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tbody>
                  <tfoot style={{ background: '#F8FAFC', borderTop: '1px solid #E2E8F0' }}>
                    <tr>
                      <td colSpan={2} style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 700, color: '#475569' }}>
                        Total Amount Paid:
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontSize: '1.05rem', fontWeight: 800, color: '#0F766E' }}>
                        LKR {parseFloat(receipt.amount || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Refund Notice if refunded */}
              {receipt.status === 'refunded' && receipt.refund && (
                <div
                  style={{
                    padding: '0.85rem 1rem',
                    background: '#FFFBEB',
                    border: '1px solid #FDE68A',
                    borderRadius: '10px',
                    color: '#92400E',
                    fontSize: '0.78rem'
                  }}
                >
                  <div style={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.25rem' }}>
                    <ArrowDownCircle size={16} />
                    <span>
                      Refund Processed: {receipt.refund.refundedAt ? new Date(receipt.refund.refundedAt).toLocaleString('en-LK') : ''}
                    </span>
                  </div>
                  <div>Reason: {receipt.refund.reason || 'Administrative or automatic cancellation refund.'}</div>
                  <div style={{ fontFamily: 'monospace', marginTop: '0.15rem' }}>
                    Gateway Refund Ref: {receipt.refund.reference || 'PROCESSED'}
                  </div>
                </div>
              )}

              {/* Policy Notice */}
              <div
                style={{
                  padding: '0.85rem 1rem',
                  background: '#F8FAFC',
                  borderRadius: '10px',
                  border: '1px solid #E2E8F0',
                  fontSize: '0.75rem',
                  color: '#64748B',
                  lineHeight: 1.5
                }}
              >
                <div style={{ fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.2rem' }}>
                  <ShieldCheck size={15} color="#0F766E" />
                  <span>Jobzy Platform Policy Notice</span>
                </div>
                <div>
                  This receipt covers platform usage and matching fees paid directly to Jobzy Platform Services. Platform booking fees are distinct from charges agreed between customers and service providers for labour, travel or materials.
                </div>
              </div>

              <div style={{ textAlign: 'center', fontSize: '0.7rem', color: '#94A3B8', paddingTop: '0.5rem', borderTop: '1px solid #F1F5F9' }}>
                Computer-generated receipt issued by {receipt.issuer?.name || 'Jobzy Platforms (Pvt) Ltd'}. All platform fees are in Sri Lankan Rupees (LKR).
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
