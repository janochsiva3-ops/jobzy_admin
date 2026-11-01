'use client';

import React, { useState, useEffect, useCallback } from 'react';
import ReceiptModal from './ReceiptModal';
import { formatSriLankaDateTime } from '@/lib/dateUtils';
import {
  DollarSign, Settings, CreditCard, RefreshCw, Search, CheckCircle2,
  AlertCircle, Clock, ShieldCheck, ArrowDownCircle, Bell, Receipt, History, RotateCcw
} from 'lucide-react';

export default function AdminPaymentsSection({ token, notifications = [] }) {
  // Sub-tabs: 'fees' | 'transactions' | 'subscriptions' | 'refunds' | 'notifications'
  const [subTab, setSubTab] = useState('fees');
  const [loading, setLoading] = useState(true);

  // 1. Fee Settings & History
  const [fees, setFees] = useState([]);
  const [feeHistory, setFeeHistory] = useState([]);
  const [editingFee, setEditingFee] = useState({});
  const [savingFeeType, setSavingFeeType] = useState(null);
  const [feeMessage, setFeeMessage] = useState(null);

  // 2. Transactions & Metrics
  const [transactions, setTransactions] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [txnSearch, setTxnSearch] = useState('');
  const [txnStatus, setTxnStatus] = useState('all');
  const [txnFeeType, setTxnFeeType] = useState('all');
  const [txnDate, setTxnDate] = useState('');

  // 3. Subscriptions
  const [subscriptions, setSubscriptions] = useState([]);

  // 4. Refunds & Receipts
  const [refundingId, setRefundingId] = useState(null);
  const [viewReceiptTxnId, setViewReceiptTxnId] = useState(null);

  const loadData = useCallback(async () => {
    const activeToken = token || (typeof window !== 'undefined' ? localStorage.getItem('jobzy_token') : '');
    if (!activeToken) return;
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${activeToken}` };
      const params = new URLSearchParams();
      if (txnStatus !== 'all') params.set('status', txnStatus);
      if (txnFeeType !== 'all') params.set('feeType', txnFeeType);
      if (txnSearch.trim()) params.set('search', txnSearch.trim());
      if (txnDate) params.set('date', txnDate);

      const [feesRes, txnsRes, subsRes] = await Promise.all([
        fetch('/api/payments/fees', { headers }),
        fetch(`/api/payments/transactions?${params.toString()}`, { headers }),
        fetch('/api/payments/subscriptions', { headers })
      ]);

      if (feesRes.ok) {
        const fData = await feesRes.json();
        setFees(fData.fees || []);
        setFeeHistory(fData.history || []);
        const initEdit = {};
        (fData.fees || []).forEach(f => {
          initEdit[f.fee_type] = {
            amount: f.amount,
            effectiveDate: f.effective_date ? f.effective_date.split('T')[0] : new Date().toISOString().split('T')[0],
            reason: '',
            isEnabled: f.is_enabled === 1,
            gracePeriodDays: f.grace_period_days || 5,
            transitionDate: f.transition_date ? f.transition_date.split('T')[0] : '',
            gatewayMode: f.gateway_mode || 'test',
            payhereMerchantId: f.payhere_merchant_id || '',
            payhereMerchantSecret: f.payhere_merchant_secret || ''
          };
        });
        setEditingFee(initEdit);
      }

      if (txnsRes.ok) {
        const tData = await txnsRes.json();
        setTransactions(tData.transactions || []);
        setMetrics(tData.metrics || null);
      }

      if (subsRes.ok) {
        const sData = await subsRes.json();
        setSubscriptions(sData.subscriptions || []);
      }
    } catch (err) {
      console.error('Error loading payment admin data:', err);
    } finally {
      setLoading(false);
    }
  }, [token, txnStatus, txnFeeType, txnSearch, txnDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleUpdateFee = async (feeType) => {
    const form = editingFee[feeType];
    if (!form) return;
    setSavingFeeType(feeType);
    setFeeMessage(null);
    try {
      const activeToken = token || localStorage.getItem('jobzy_token');
      const res = await fetch('/api/payments/fees', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${activeToken}`
        },
        body: JSON.stringify({
          feeType,
          amount: parseFloat(form.amount),
          effectiveDate: form.effectiveDate,
          reason: form.reason || 'Updated by Administrator',
          isEnabled: form.isEnabled ? 1 : 0,
          gracePeriodDays: parseInt(form.gracePeriodDays || 5, 10),
          transitionDate: form.transitionDate || null,
          gatewayMode: form.gatewayMode,
          payhereMerchantId: form.payhereMerchantId,
          payhereMerchantSecret: form.payhereMerchantSecret
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update fee.');
      setFeeMessage({ type: 'success', text: data.message || 'Fee settings updated and recorded in audit log.' });
      loadData();
    } catch (err) {
      setFeeMessage({ type: 'error', text: err.message });
    } finally {
      setSavingFeeType(null);
    }
  };

  const handleIssueRefund = async (txn) => {
    const reason = prompt(`Enter reason for refunding ${txn.transaction_reference} (LKR ${txn.amount}):`, 'Administrator approved refund');
    if (!reason) return;

    setRefundingId(txn.id);
    try {
      const activeToken = token || localStorage.getItem('jobzy_token');
      const res = await fetch('/api/payments/refunds', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${activeToken}`
        },
        body: JSON.stringify({
          transactionId: txn.id,
          reason
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Refund failed.');
      alert(`Refund confirmed for ${txn.transaction_reference}.`);
      loadData();
    } catch (err) {
      alert(err.message);
    } finally {
      setRefundingId(null);
    }
  };

  const paymentNotifications = (notifications || []).filter(n =>
    n.type === 'payment' ||
    (n.title && /payment|fee|subscription|refund|paid/i.test(n.title)) ||
    (n.message && /LKR|payment|subscription|refund|fee/i.test(n.message))
  );

  const refundedTransactions = transactions.filter(t => t.status === 'refunded');
  const refundableTransactions = transactions.filter(t => t.status === 'successful');

  return (
    <div>
      {/* Section Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', color: '#0F172A', fontWeight: 800 }}>Payments &amp; Subscriptions</h2>
          <p style={{ color: '#64748B', fontSize: '0.9rem' }}>
            Configure LKR platform fees, monitor collected revenue vs unpaid charges, manage provider subscriptions, and process refunds.
          </p>
        </div>
        <button onClick={loadData} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <RefreshCw size={15} /> Refresh Ledger
        </button>
      </div>

      {/* Sub-Navigation Pills */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.5rem', borderBottom: '1px solid #E2E8F0', paddingBottom: '0.75rem' }}>
        {[
          { id: 'fees', label: 'Fee Settings', icon: Settings },
          { id: 'transactions', label: `Transactions (${transactions.length})`, icon: CreditCard },
          { id: 'subscriptions', label: `Provider Subscriptions (${subscriptions.length})`, icon: ShieldCheck },
          { id: 'refunds', label: `Refunds (${refundedTransactions.length})`, icon: RotateCcw },
          { id: 'notifications', label: `Payment Notifications (${paymentNotifications.length})`, icon: Bell }
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = subTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setSubTab(tab.id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                padding: '0.55rem 1rem',
                borderRadius: '8px',
                fontSize: '0.85rem',
                fontWeight: 700,
                border: isActive ? '1px solid #0F766E' : '1px solid #E2E8F0',
                background: isActive ? '#0F766E' : '#FFFFFF',
                color: isActive ? '#FFFFFF' : '#475569',
                cursor: 'pointer'
              }}
            >
              <Icon size={15} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* 1. FEE SETTINGS SUB-TAB */}
      {subTab === 'fees' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {feeMessage && (
            <div style={{
              padding: '0.85rem 1rem',
              borderRadius: '8px',
              background: feeMessage.type === 'success' ? '#DCFCE7' : '#FEE2E2',
              color: feeMessage.type === 'success' ? '#166534' : '#991B1B',
              border: `1px solid ${feeMessage.type === 'success' ? '#86EFAC' : '#FCA5A5'}`,
              fontSize: '0.875rem',
              fontWeight: 600
            }}>
              {feeMessage.text}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.25rem' }}>
            {fees.map(fee => {
              const edit = editingFee[fee.fee_type] || {};
              return (
                <div key={fee.fee_type} className="card" style={{ padding: '1.25rem', borderTop: '4px solid #0F766E' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                    <div>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: '#0F766E' }}>
                        {fee.fee_type.replace(/_/g, ' ')} • v{fee.version}
                      </span>
                      <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0F172A', marginTop: '0.15rem' }}>{fee.title}</h3>
                    </div>
                    <span className="badge" style={{ background: '#F0FDF4', color: '#166534', fontWeight: 800 }}>
                      LKR {parseFloat(fee.amount).toLocaleString()}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: '#64748B', marginBottom: '1rem' }}>{fee.description}</p>

                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.8rem' }}>Fee Amount (LKR)</label>
                    <input
                      type="number"
                      min="0"
                      step="50"
                      className="form-control"
                      value={edit.amount ?? fee.amount}
                      onChange={e => setEditingFee(prev => ({
                        ...prev,
                        [fee.fee_type]: { ...prev[fee.fee_type], amount: e.target.value }
                      }))}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.8rem' }}>Effective Date (Applies to future charges only)</label>
                    <input
                      type="date"
                      className="form-control"
                      value={edit.effectiveDate || ''}
                      onChange={e => setEditingFee(prev => ({
                        ...prev,
                        [fee.fee_type]: { ...prev[fee.fee_type], effectiveDate: e.target.value }
                      }))}
                    />
                  </div>

                  {fee.fee_type === 'provider_subscription' && (
                    <div className="grid-2">
                      <div className="form-group">
                        <label className="form-label" style={{ fontSize: '0.75rem' }}>Grace Period (Days)</label>
                        <input
                          type="number"
                          min="0"
                          max="30"
                          className="form-control"
                          value={edit.gracePeriodDays ?? 5}
                          onChange={e => setEditingFee(prev => ({
                            ...prev,
                            [fee.fee_type]: { ...prev[fee.fee_type], gracePeriodDays: e.target.value }
                          }))}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label" style={{ fontSize: '0.75rem' }}>Transition Date</label>
                        <input
                          type="date"
                          className="form-control"
                          value={edit.transitionDate || ''}
                          onChange={e => setEditingFee(prev => ({
                            ...prev,
                            [fee.fee_type]: { ...prev[fee.fee_type], transitionDate: e.target.value }
                          }))}
                        />
                      </div>
                    </div>
                  )}

                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.8rem' }}>Gateway Mode</label>
                    <select
                      className="form-control"
                      value={edit.gatewayMode || 'test'}
                      onChange={e => setEditingFee(prev => ({
                        ...prev,
                        [fee.fee_type]: { ...prev[fee.fee_type], gatewayMode: e.target.value }
                      }))}
                    >
                      <option value="test">Test Gateway Sandbox (LKR Simulation)</option>
                      <option value="live">PayHere Sri Lanka Live Gateway</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.8rem' }}>Change Reason (Audit Trail)</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. Q4 fee adjustment"
                      value={edit.reason || ''}
                      onChange={e => setEditingFee(prev => ({
                        ...prev,
                        [fee.fee_type]: { ...prev[fee.fee_type], reason: e.target.value }
                      }))}
                    />
                  </div>

                  <button
                    onClick={() => handleUpdateFee(fee.fee_type)}
                    disabled={savingFeeType === fee.fee_type}
                    className="btn btn-primary"
                    style={{ width: '100%' }}
                  >
                    {savingFeeType === fee.fee_type ? 'Saving...' : `Update ${fee.title}`}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Fee Change Audit History */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <History size={18} color="#0F766E" />
              <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#0F172A' }}>Fee-Change Audit History</h3>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                  <tr>
                    {['Fee Type', 'Previous (LKR)', 'New Amount (LKR)', 'Version', 'Effective Date', 'Changed By', 'Reason', 'Recorded At'].map(h => (
                      <th key={h} style={{ padding: '0.7rem 1rem', textAlign: 'left', color: '#64748B', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {feeHistory.map((item, idx) => (
                    <tr key={item.id} style={{ borderBottom: '1px solid #F1F5F9', background: idx % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                      <td style={{ padding: '0.7rem 1rem', fontWeight: 700, color: '#0F172A', textTransform: 'capitalize' }}>{item.fee_type?.replace(/_/g, ' ')}</td>
                      <td style={{ padding: '0.7rem 1rem', color: '#64748B' }}>LKR {parseFloat(item.previous_amount || 0).toLocaleString()}</td>
                      <td style={{ padding: '0.7rem 1rem', fontWeight: 800, color: '#0F766E' }}>LKR {parseFloat(item.new_amount || 0).toLocaleString()}</td>
                      <td style={{ padding: '0.7rem 1rem', fontFamily: 'monospace' }}>v{item.version}</td>
                      <td style={{ padding: '0.7rem 1rem', color: '#334155' }}>{item.effective_date?.split('T')[0]}</td>
                      <td style={{ padding: '0.7rem 1rem', color: '#334155' }}>{item.changed_by_name || item.changed_by_email || item.changed_by}</td>
                      <td style={{ padding: '0.7rem 1rem', color: '#64748B' }}>{item.reason}</td>
                      <td style={{ padding: '0.7rem 1rem', color: '#94A3B8' }}>{item.created_at?.split('T')[0]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 2. TRANSACTIONS SUB-TAB */}
      {subTab === 'transactions' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Revenue vs Unpaid Charges KPI Cards */}
          {metrics && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '1rem' }}>
              <div className="card" style={{ padding: '1rem', borderLeft: '4px solid #059669' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Gross Collected Revenue</div>
                <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#059669', marginTop: '0.25rem' }}>
                  LKR {(metrics.grossCollections || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#64748B' }}>{metrics.successfulCount || 0} confirmed payments</div>
              </div>

              <div className="card" style={{ padding: '1rem', borderLeft: '4px solid #0F766E' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Net Platform Proceeds</div>
                <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0F766E', marginTop: '0.25rem' }}>
                  LKR {(metrics.netProceeds || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#64748B' }}>Gateway fees: LKR {(metrics.gatewayFees || 0).toLocaleString()}</div>
              </div>

              <div className="card" style={{ padding: '1rem', borderLeft: '4px solid #D97706' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Refunds Issued</div>
                <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#D97706', marginTop: '0.25rem' }}>
                  LKR {(metrics.refundedTotal || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#64748B' }}>{metrics.refundedCount || 0} refunded transactions</div>
              </div>

              <div className="card" style={{ padding: '1rem', borderLeft: '4px solid #64748B' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Unpaid / Pending Charges</div>
                <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#334155', marginTop: '0.25rem' }}>
                  LKR {(metrics.unpaidPendingCharges || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#64748B' }}>{metrics.pendingCount || 0} pending checkouts (Not collected)</div>
              </div>
            </div>
          )}

          {/* Search & Filters */}
          <div className="card" style={{ padding: '1rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: '1 1 220px', position: 'relative' }}>
              <input
                type="text"
                className="form-control"
                placeholder="Search by user, Txn ID (TXN-...), Booking ID..."
                value={txnSearch}
                onChange={e => setTxnSearch(e.target.value)}
              />
            </div>
            <select className="form-control" style={{ width: 'auto' }} value={txnStatus} onChange={e => setTxnStatus(e.target.value)}>
              <option value="all">All Statuses</option>
              <option value="successful">Successful (Paid)</option>
              <option value="pending">Pending (Unpaid)</option>
              <option value="failed">Failed</option>
              <option value="refunded">Refunded</option>
            </select>
            <select className="form-control" style={{ width: 'auto' }} value={txnFeeType} onChange={e => setTxnFeeType(e.target.value)}>
              <option value="all">All Fee Types</option>
              <option value="provider_registration">Provider Registration Fee</option>
              <option value="provider_subscription">Monthly Subscription</option>
              <option value="customer_booking">Customer Booking Fee</option>
            </select>
            <input
              type="date"
              className="form-control"
              style={{ width: 'auto' }}
              value={txnDate}
              onChange={e => setTxnDate(e.target.value)}
            />
          </div>

          {/* Transactions Table */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                  <tr>
                    {['Transaction ID', 'User', 'Role', 'Fee Type', 'Related ID', 'Amount (LKR)', 'Status', 'Date', 'Actions'].map(h => (
                      <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', color: '#64748B', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {transactions.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ padding: '2rem', textAlign: 'center', color: '#94A3B8' }}>No matching transactions found.</td>
                    </tr>
                  ) : transactions.map((txn, idx) => (
                    <tr key={txn.id} style={{ borderBottom: '1px solid #F1F5F9', background: idx % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                      <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontWeight: 700, color: '#0F172A' }}>{txn.transaction_reference}</td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ fontWeight: 600, color: '#0F172A' }}>{txn.user_name || txn.user_full_name}</div>
                        <div style={{ fontSize: '0.72rem', color: '#64748B' }}>{txn.user_email || txn.user_account_email}</div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textTransform: 'capitalize', color: '#475569' }}>{txn.user_role}</td>
                      <td style={{ padding: '0.75rem 1rem', color: '#334155', textTransform: 'capitalize' }}>
                        {txn.fee_type?.replace(/_/g, ' ')} (v{txn.fee_version || 1})
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontSize: '0.75rem', color: '#475569' }}>{txn.related_id || '—'}</td>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 800, color: '#0F172A' }}>
                        LKR {parseFloat(txn.amount || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span style={{
                          padding: '0.2rem 0.55rem',
                          borderRadius: '9999px',
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          background: txn.status === 'successful' ? '#DCFCE7' : txn.status === 'refunded' ? '#FEF3C7' : txn.status === 'failed' ? '#FEE2E2' : '#F1F5F9',
                          color: txn.status === 'successful' ? '#166534' : txn.status === 'refunded' ? '#92400E' : txn.status === 'failed' ? '#991B1B' : '#475569'
                        }}>
                          {txn.status?.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', color: '#64748B' }}>{txn.created_at?.split('T')[0]}</td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          {(txn.status === 'successful' || txn.status === 'refunded') && (
                            <button
                              onClick={() => setViewReceiptTxnId(txn.id)}
                              style={{ fontSize: '0.75rem', color: '#0F766E', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}
                            >
                              Receipt
                            </button>
                          )}
                          {txn.status === 'successful' && (
                            <button
                              onClick={() => handleIssueRefund(txn)}
                              disabled={refundingId === txn.id}
                              style={{ fontSize: '0.75rem', color: '#DC2626', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}
                            >
                              {refundingId === txn.id ? 'Refunding...' : 'Refund'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 3. PROVIDER SUBSCRIPTIONS SUB-TAB */}
      {subTab === 'subscriptions' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #E2E8F0' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#0F172A' }}>Provider Monthly Subscriptions &amp; 5-Day Grace Period Monitor</h3>
            <p style={{ fontSize: '0.8rem', color: '#64748B' }}>
              Service providers appear in public search only when their registration fee is Paid, Admin Approval is Approved, Account Access is Active, and Subscription is Active (or within the 5-day Past Due grace period). All dates shown in Sri Lanka Standard Time (UTC+5:30).
            </p>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                <tr>
                  {['Provider', 'Reg ID', 'Account Access', 'Approval', 'Sub Status', 'Fee (LKR)', 'Current Period', 'Next Due (SLST)', '5-Day Grace Deadline'].map(h => (
                    <th key={h} style={{ padding: '0.75rem 0.85rem', textAlign: 'left', color: '#64748B', fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {subscriptions.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ padding: '2rem', textAlign: 'center', color: '#94A3B8' }}>No provider subscription records yet.</td>
                  </tr>
                ) : subscriptions.map((sub, idx) => {
                  const accessLabel =
                    sub.user_status === 'removed'
                      ? 'Removed'
                      : sub.manual_suspended === 1 && sub.subscription_suspended === 1
                      ? 'Manual + Unpaid Sub'
                      : sub.manual_suspended === 1 || sub.suspension_type === 'manual'
                      ? 'Manual Suspension'
                      : sub.subscription_suspended === 1 || sub.status === 'suspended_unpaid' || sub.user_status === 'suspended'
                      ? 'Suspended — Unpaid Subscription'
                      : 'Active';
                  return (
                    <tr key={sub.id} style={{ borderBottom: '1px solid #F1F5F9', background: idx % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                      <td style={{ padding: '0.75rem 0.85rem' }}>
                        <div style={{ fontWeight: 700, color: '#0F172A' }}>{sub.provider_name}</div>
                        <div style={{ fontSize: '0.72rem', color: '#64748B' }}>{sub.provider_email}</div>
                      </td>
                      <td style={{ padding: '0.75rem 0.85rem', fontFamily: 'monospace', fontWeight: 700, color: '#1E40AF' }}>{sub.confirmation_id || '—'}</td>
                      <td style={{ padding: '0.75rem 0.85rem' }}>
                        <span style={{
                          padding: '0.2rem 0.55rem',
                          borderRadius: '9999px',
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          background: accessLabel === 'Active' ? '#DCFCE7' : '#FEE2E2',
                          color: accessLabel === 'Active' ? '#166534' : '#991B1B'
                        }}>
                          {accessLabel}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 0.85rem', textTransform: 'capitalize', fontWeight: 600 }}>{sub.verification_status}</td>
                      <td style={{ padding: '0.75rem 0.85rem' }}>
                        <span style={{
                          padding: '0.2rem 0.55rem',
                          borderRadius: '9999px',
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          background: sub.status === 'active' ? '#DCFCE7' : sub.status === 'past_due' ? '#FEF3C7' : sub.status === 'pending' ? '#DBEAFE' : '#FEE2E2',
                          color: sub.status === 'active' ? '#166534' : sub.status === 'past_due' ? '#92400E' : sub.status === 'pending' ? '#1E40AF' : '#991B1B'
                        }}>
                          {sub.status === 'suspended_unpaid'
                            ? 'SUSPENDED — UNPAID'
                            : sub.status === 'past_due'
                            ? 'PAST DUE (GRACE)'
                            : sub.status === 'pending'
                            ? 'AWAITING 1ST PAYMENT'
                            : sub.status?.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 0.85rem', fontWeight: 700 }}>LKR {parseFloat(sub.current_amount || sub.current_fee_amount || 1500).toLocaleString()}</td>
                      <td style={{ padding: '0.75rem 0.85rem', color: '#475569', fontSize: '0.75rem' }}>
                        {sub.current_period_start ? `${formatSriLankaDateTime(sub.current_period_start, false)} → ${formatSriLankaDateTime(sub.current_period_end, false)}` : 'Not started'}
                      </td>
                      <td style={{ padding: '0.75rem 0.85rem', fontWeight: 600, color: '#0F172A', fontSize: '0.75rem' }}>
                        {sub.next_due_date ? formatSriLankaDateTime(sub.next_due_date, true) : 'Upon 1st payment'}
                      </td>
                      <td style={{ padding: '0.75rem 0.85rem', color: sub.status === 'past_due' ? '#B45309' : '#64748B', fontWeight: sub.status === 'past_due' ? 700 : 500, fontSize: '0.75rem' }}>
                        {sub.grace_period_end ? formatSriLankaDateTime(sub.grace_period_end, true) : '5 days from due date'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. REFUNDS SUB-TAB */}
      {subTab === 'refunds' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #E2E8F0' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#0F172A' }}>Processed Refunds Ledger</h3>
              <p style={{ fontSize: '0.8rem', color: '#64748B' }}>All automatic and administrator-initiated refunds confirmed by the payment gateway.</p>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                  <tr>
                    {['Txn Ref', 'User', 'Fee Type', 'Amount (LKR)', 'Refund Reason', 'Gateway Refund Ref', 'Refunded At', 'Receipt'].map(h => (
                      <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', color: '#64748B', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {refundedTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ padding: '2rem', textAlign: 'center', color: '#94A3B8' }}>No refunded transactions recorded yet.</td>
                    </tr>
                  ) : refundedTransactions.map((txn, idx) => (
                    <tr key={txn.id} style={{ borderBottom: '1px solid #F1F5F9', background: idx % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                      <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontWeight: 700 }}>{txn.transaction_reference}</td>
                      <td style={{ padding: '0.75rem 1rem' }}>{txn.user_name || txn.user_full_name}</td>
                      <td style={{ padding: '0.75rem 1rem', textTransform: 'capitalize' }}>{txn.fee_type?.replace(/_/g, ' ')}</td>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#D97706' }}>LKR {parseFloat(txn.amount || 0).toLocaleString()}</td>
                      <td style={{ padding: '0.75rem 1rem', color: '#334155' }}>{txn.refund_reason || 'Refunded'}</td>
                      <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontSize: '0.75rem' }}>{txn.refund_gateway_reference || '—'}</td>
                      <td style={{ padding: '0.75rem 1rem', color: '#64748B' }}>{txn.refunded_at?.split('T')[0] || '—'}</td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <button
                          onClick={() => setViewReceiptTxnId(txn.id)}
                          style={{ fontSize: '0.75rem', color: '#0F766E', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}
                        >
                          View Receipt
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {refundableTransactions.length > 0 && (
            <div className="card" style={{ padding: '1rem 1.25rem' }}>
              <h4 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0F172A', marginBottom: '0.5rem' }}>Eligible Paid Transactions for Manual Refund</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {refundableTransactions.slice(0, 10).map(txn => (
                  <div key={txn.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0.85rem', background: '#F8FAFC', borderRadius: '8px', fontSize: '0.82rem' }}>
                    <div>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{txn.transaction_reference}</span>
                      <span style={{ marginLeft: '0.75rem', color: '#334155' }}>{txn.user_name} ({txn.fee_type?.replace(/_/g, ' ')})</span>
                      <span style={{ marginLeft: '0.75rem', fontWeight: 700, color: '#0F766E' }}>LKR {parseFloat(txn.amount).toLocaleString()}</span>
                    </div>
                    <button
                      onClick={() => handleIssueRefund(txn)}
                      disabled={refundingId === txn.id}
                      className="btn btn-secondary"
                      style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem', color: '#DC2626', borderColor: '#FCA5A5' }}
                    >
                      {refundingId === txn.id ? 'Processing...' : 'Issue Refund'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 5. PAYMENT NOTIFICATIONS SUB-TAB */}
      {subTab === 'notifications' && (
        <div className="card" style={{ padding: '1.25rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#0F172A', marginBottom: '0.75rem' }}>Payment &amp; Subscription Alert Log</h3>
          {paymentNotifications.length === 0 ? (
            <p style={{ color: '#94A3B8', fontSize: '0.875rem', textAlign: 'center', padding: '2rem 0' }}>No payment notifications yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {paymentNotifications.map(n => (
                <div key={n.id} style={{ padding: '0.85rem 1rem', borderRadius: '8px', border: '1px solid #E2E8F0', background: n.is_read ? '#FFFFFF' : '#F0FDF4' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.88rem', color: '#0F172A' }}>{n.title}</span>
                    <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>{n.created_at?.split('T')[0]}</span>
                  </div>
                  <p style={{ fontSize: '0.82rem', color: '#475569', marginTop: '0.25rem' }}>{n.message}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {viewReceiptTxnId && (
        <ReceiptModal
          isOpen={!!viewReceiptTxnId}
          onClose={() => setViewReceiptTxnId(null)}
          transactionId={viewReceiptTxnId}
        />
      )}
    </div>
  );
}

