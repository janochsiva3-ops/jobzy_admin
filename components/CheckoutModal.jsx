'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { X, ShieldCheck, CreditCard, AlertCircle, CheckCircle2, ArrowRight, RefreshCw, Info, Receipt } from 'lucide-react';
import ReceiptModal from './ReceiptModal';

export default function CheckoutModal({
  isOpen,
  onClose,
  feeType,
  relatedId,
  title,
  subtitle,
  providerName,
  providerRateInfo,
  onSuccess
}) {
  const { token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [checkoutData, setCheckoutData] = useState(null);
  const [error, setError] = useState(null);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(null);
  const [showReceipt, setShowReceipt] = useState(false);

  useEffect(() => {
    if (!isOpen || !feeType) {
      setCheckoutData(null);
      setError(null);
      setPaymentSuccess(null);
      setProcessingPayment(false);
      return;
    }

    async function initCheckout() {
      setLoading(true);
      setError(null);
      try {
        const activeToken = token || (typeof window !== 'undefined' ? localStorage.getItem('jobzy_token') : '');
        const res = await fetch('/api/payments/checkout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(activeToken ? { Authorization: `Bearer ${activeToken}` } : {})
          },
          body: JSON.stringify({
            feeType,
            relatedId
          })
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Failed to initialize payment checkout.');
        }
        setCheckoutData({
          transaction: data.transaction,
          billingPeriod: data.billingPeriod || null,
          feeAmount: data.transaction?.amount ?? data.feeSetting?.amount,
          gatewayMode: data.feeSetting?.gatewayMode ?? (data.isTestGateway ? 'test' : 'live'),
          isTestGateway: data.isTestGateway,
          payhereUrl: data.isTestGateway ? null : 'https://www.payhere.lk/pay/checkout',
          payherePayload: data.payherePayload,
          feeSettings: data.feeSetting
        });
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    initCheckout();
  }, [isOpen, feeType, relatedId, token]);

  if (!isOpen) return null;

  const handleSimulatePayment = async (status = 'success') => {
    if (!checkoutData?.transaction) return;
    setProcessingPayment(true);
    setError(null);

    try {
      const activeToken = token || (typeof window !== 'undefined' ? localStorage.getItem('jobzy_token') : '');
      const res = await fetch('/api/payments/confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(activeToken ? { Authorization: `Bearer ${activeToken}` } : {})
        },
        body: JSON.stringify({
          transactionId: checkoutData.transaction.id,
          orderId: checkoutData.transaction.transaction_reference,
          simulationStatus: status
        })
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || 'Payment failed or was declined.');
      }

      setPaymentSuccess(result);
      if (onSuccess) {
        onSuccess(result);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setProcessingPayment(false);
    }
  };

  return (
    <>
      <div className="modal-backdrop" onClick={onClose}>
        <div
          className="modal-content"
          onClick={(e) => e.stopPropagation()}
          style={{ maxWidth: '520px', width: '100%', overflow: 'hidden', borderRadius: '16px' }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '1.1rem 1.5rem',
              background: '#142D4E',
              color: '#FFFFFF',
              borderBottom: '1px solid rgba(255,255,255,0.1)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: '#0F766E',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#FFFFFF',
                  fontWeight: 800,
                  fontSize: '0.95rem'
                }}
              >
                J
              </div>
              <div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#FFFFFF', margin: 0 }}>
                  Job<span style={{ color: '#FF7A00' }}>Z</span>y Platform Checkout
                </h3>
                <p style={{ fontSize: '0.75rem', color: '#CBD5E1', margin: 0 }}>
                  Secure Sri Lankan Rupees (LKR) Payment
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.1)',
                border: 'none',
                color: '#FFFFFF',
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
              aria-label="Close checkout"
            >
              <X size={18} />
            </button>
          </div>

          {/* Body */}
          <div className="modal-body" style={{ padding: '1.5rem' }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: '#64748B' }}>
                <div className="spinner" style={{ margin: '0 auto 1rem' }} />
                <p style={{ fontSize: '0.9rem', fontWeight: 600 }}>Preparing checkout details...</p>
              </div>
            ) : paymentSuccess ? (
              /* Success State */
              <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                <div
                  style={{
                    width: '56px',
                    height: '56px',
                    background: '#DCFCE7',
                    color: '#059669',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 1rem'
                  }}
                >
                  <CheckCircle2 size={32} />
                </div>
                <h4 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0F172A', marginBottom: '0.35rem' }}>
                  Payment Confirmed!
                </h4>
                <p style={{ fontSize: '0.85rem', color: '#64748B', maxWidth: '380px', margin: '0 auto 1.25rem' }}>
                  {paymentSuccess.message || 'Your payment has been verified by the server and recorded.'}
                </p>

                <div
                  style={{
                    background: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    borderRadius: '10px',
                    padding: '1rem',
                    fontSize: '0.82rem',
                    textAlign: 'left',
                    marginBottom: '1.25rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.45rem'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748B' }}>Transaction Ref:</span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#0F172A' }}>
                      {paymentSuccess.transaction?.transaction_reference}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748B' }}>Amount Paid:</span>
                    <span style={{ fontWeight: 800, color: '#0F766E' }}>
                      LKR {parseFloat(paymentSuccess.transaction?.amount || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748B' }}>Status:</span>
                    <span style={{ fontWeight: 700, color: '#059669', textTransform: 'uppercase', fontSize: '0.75rem' }}>
                      Server Verified (Paid)
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => setShowReceipt(true)}
                    className="btn btn-secondary"
                    style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
                  >
                    <Receipt size={15} /> View Official Receipt
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="btn btn-primary"
                    style={{ flex: 1 }}
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              /* Checkout Details */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {error && (
                  <div
                    style={{
                      padding: '0.75rem 1rem',
                      background: '#FEE2E2',
                      border: '1px solid #FCA5A5',
                      borderRadius: '10px',
                      color: '#B91C1C',
                      fontSize: '0.82rem',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '0.5rem'
                    }}
                  >
                    <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                    <span>{error}</span>
                  </div>
                )}

                {/* Service / Scope details */}
                <div
                  style={{
                    border: '1px solid #E2E8F0',
                    background: '#F8FAFC',
                    borderRadius: '10px',
                    padding: '0.9rem 1rem'
                  }}
                >
                  <div style={{ fontWeight: 700, color: '#0F172A', fontSize: '0.95rem' }}>
                    {title ||
                      (feeType === 'provider_registration'
                        ? 'Provider Registration Fee'
                        : feeType === 'provider_subscription'
                        ? 'Monthly Provider Subscription'
                        : 'Customer Booking Request Fee')}
                  </div>
                  {subtitle && (
                    <p style={{ color: '#64748B', fontSize: '0.8rem', margin: '0.2rem 0 0' }}>{subtitle}</p>
                  )}

                  {providerName && (
                    <div
                      style={{
                        paddingTop: '0.6rem',
                        marginTop: '0.6rem',
                        borderTop: '1px solid #E2E8F0',
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '0.8rem'
                      }}
                    >
                      <span style={{ color: '#64748B' }}>Service Provider:</span>
                      <span style={{ fontWeight: 600, color: '#1E293B' }}>{providerName}</span>
                    </div>
                  )}

                  {providerRateInfo && (
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '0.8rem',
                        marginTop: '0.25rem'
                      }}
                    >
                      <span style={{ color: '#64748B' }}>Provider Service Rate:</span>
                      <span style={{ fontWeight: 600, color: '#1E293B' }}>{providerRateInfo}</span>
                    </div>
                  )}
                </div>

                {/* Fee Breakdown */}
                <div
                  style={{
                    border: '1px solid #99F6E4',
                    background: '#F0FDFA',
                    borderRadius: '12px',
                    padding: '1rem'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#142D4E' }}>Jobzy Platform Fee</div>
                      <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                        Sri Lanka Operations &amp; Matching Fee (v{checkoutData?.feeSettings?.version || 1})
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0F766E' }}>
                        LKR {parseFloat(checkoutData?.feeAmount || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 })}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 600 }}>Payable Now</div>
                    </div>
                  </div>

                  {feeType === 'customer_booking' && (
                    <div
                      style={{
                        padding: '0.65rem 0.75rem',
                        background: '#FFFFFF',
                        borderRadius: '8px',
                        border: '1px solid #CCFBF1',
                        fontSize: '0.76rem',
                        color: '#475569',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '0.5rem',
                        lineHeight: 1.45
                      }}
                    >
                      <Info size={15} color="#0F766E" style={{ flexShrink: 0, marginTop: '2px' }} />
                      <div>
                        <strong style={{ color: '#0F172A' }}>Booking Fee &amp; Availability Notice: </strong>
                        Paying this LKR {checkoutData?.feeAmount} platform fee changes your booking to <strong>Pending Provider Acceptance</strong> and submits your request to the provider. Payment enables your request to proceed; it does not automatically confirm provider availability. The service provider’s charges for work and materials are separate.
                      </div>
                    </div>
                  )}

                  {feeType === 'provider_registration' && (
                    <div
                      style={{
                        padding: '0.65rem 0.75rem',
                        background: '#FFFFFF',
                        borderRadius: '8px',
                        border: '1px solid #CCFBF1',
                        fontSize: '0.76rem',
                        color: '#475569',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '0.5rem',
                        lineHeight: 1.45
                      }}
                    >
                      <Info size={15} color="#0F766E" style={{ flexShrink: 0, marginTop: '2px' }} />
                      <div>
                        <strong style={{ color: '#0F172A' }}>Registration Terms: </strong>
                        One-time onboarding fee. Verified payment changes your status from <strong>Awaiting Registration Payment</strong> to <strong>Pending Admin Approval</strong>. Payment alone does not approve your account; an administrator must review and approve it manually, after which your first monthly subscription is required before public activation.
                      </div>
                    </div>
                  )}

                  {feeType === 'provider_subscription' && (
                    <div
                      style={{
                        padding: '0.65rem 0.75rem',
                        background: '#FFFFFF',
                        borderRadius: '8px',
                        border: '1px solid #CCFBF1',
                        fontSize: '0.76rem',
                        color: '#475569',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.45rem',
                        lineHeight: 1.45
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                        <Info size={15} color="#0F766E" style={{ flexShrink: 0, marginTop: '2px' }} />
                        <div>
                          <strong style={{ color: '#0F172A' }}>Monthly Coverage &amp; 5-Day Grace Period: </strong>
                          Provides 1 full month of verified listing visibility in search and customer lead reception, with a <strong>5-day grace period</strong> for renewals before automatic suspension.
                        </div>
                      </div>
                      {checkoutData?.billingPeriod && (
                        <div
                          style={{
                            marginTop: '0.2rem',
                            padding: '0.5rem 0.65rem',
                            background: '#F0FDFA',
                            border: '1px solid #99F6E4',
                            borderRadius: '6px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.25rem'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                            <span style={{ color: '#475569', fontWeight: 600 }}>Billing Period Covered:</span>
                            <span style={{ color: '#0F172A', fontWeight: 700 }}>
                              {checkoutData.billingPeriod.periodStartFormatted} &rarr; {checkoutData.billingPeriod.periodEndFormatted}
                            </span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                            <span style={{ color: '#475569', fontWeight: 600 }}>Resulting Subscription End Date:</span>
                            <span style={{ color: '#0F766E', fontWeight: 800 }}>
                              {checkoutData.billingPeriod.periodEndDateTimeFormatted || checkoutData.billingPeriod.periodEndFormatted}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Refund & Guarantee Notice */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontSize: '0.76rem',
                    color: '#065F46',
                    background: '#ECFDF5',
                    border: '1px solid #A7F3D0',
                    padding: '0.65rem 0.85rem',
                    borderRadius: '10px'
                  }}
                >
                  <ShieldCheck size={16} color="#059669" style={{ flexShrink: 0 }} />
                  <span>
                    {feeType === 'customer_booking'
                      ? '100% Refund Guarantee: Automatically refunded if the professional declines or the request expires.'
                      : 'Secure Sri Lankan Rupees (LKR) payment processing.'}
                  </span>
                </div>

                {/* Payment Gateway Actions */}
                {checkoutData?.gatewayMode === 'test' ? (
                  <div
                    style={{
                      border: '2px dashed #5EEAD4',
                      background: '#F0FDFA',
                      borderRadius: '12px',
                      padding: '1rem',
                      textAlign: 'center'
                    }}
                  >
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '0.2rem 0.65rem',
                        borderRadius: '9999px',
                        fontSize: '0.68rem',
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        background: '#CCFBF1',
                        color: '#0F766E',
                        marginBottom: '0.4rem'
                      }}
                    >
                      Test Gateway Sandbox Mode
                    </span>
                    <p style={{ fontSize: '0.78rem', color: '#475569', margin: '0 0 0.85rem' }}>
                      Test mode is active. Simulate instant payment outcomes with zero real card charges.
                    </p>
                    <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        disabled={processingPayment || !checkoutData?.transaction}
                        onClick={() => handleSimulatePayment('success')}
                        className="btn btn-primary"
                        style={{
                          flex: 1,
                          background: '#0F766E',
                          borderColor: '#0F766E',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.4rem',
                          fontSize: '0.82rem'
                        }}
                      >
                        {processingPayment ? (
                          <span>Processing...</span>
                        ) : (
                          <>
                            <span>Simulate Payment (Success)</span>
                            <ArrowRight size={15} />
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        disabled={processingPayment || !checkoutData?.transaction}
                        onClick={() => handleSimulatePayment('failed')}
                        className="btn btn-secondary"
                        style={{
                          color: '#B91C1C',
                          borderColor: '#FCA5A5',
                          background: '#FEF2F2',
                          fontSize: '0.8rem'
                        }}
                      >
                        Simulate Failure
                      </button>
                    </div>
                  </div>
                ) : (
                  <form action={checkoutData?.payhereUrl} method="POST">
                    {checkoutData?.payherePayload &&
                      Object.entries(checkoutData.payherePayload).map(([key, val]) => (
                        <input key={key} type="hidden" name={key} value={val} />
                      ))}
                    <button
                      type="submit"
                      className="btn btn-primary"
                      style={{
                        width: '100%',
                        background: '#0F766E',
                        borderColor: '#0F766E',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem'
                      }}
                    >
                      <CreditCard size={16} />
                      <span>
                        Pay LKR {parseFloat(checkoutData?.feeAmount || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 })} with PayHere
                      </span>
                    </button>
                    <p style={{ fontSize: '0.7rem', textAlign: 'center', color: '#94A3B8', marginTop: '0.5rem' }}>
                      Supports VISA, MasterCard, FriMi, Genie, eZ Cash, and mCash.
                    </p>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Official Printable Receipt Modal */}
      {showReceipt && paymentSuccess?.transaction && (
        <ReceiptModal
          isOpen={showReceipt}
          onClose={() => {
            setShowReceipt(false);
            onClose();
          }}
          transactionId={paymentSuccess.transaction.id}
        />
      )}
    </>
  );
}
