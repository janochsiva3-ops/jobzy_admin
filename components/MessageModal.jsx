'use client';
import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { X, Send, User, AlertCircle } from 'lucide-react';

export default function MessageModal({ isOpen, onClose, recipientId, recipientName, bookingId }) {
  const { user, token } = useAuth();
  const [messages, setMessages] = useState([]);
  const [inputContent, setInputContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!isOpen || !token || !recipientId) return;

    const fetchMessages = async () => {
      setLoading(true);
      try {
        const url = bookingId 
          ? `/api/messages?bookingId=${bookingId}`
          : `/api/messages?otherUserId=${recipientId}`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setMessages(data);
        }
      } catch (err) {
        console.error('Failed to load conversation:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchMessages();
    const interval = setInterval(fetchMessages, 6000);
    return () => clearInterval(interval);
  }, [isOpen, token, recipientId, bookingId]);

  if (!isOpen) return null;

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputContent.trim()) return;

    setSending(true);
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          receiverId: recipientId,
          bookingId: bookingId || null,
          content: inputContent.trim()
        })
      });

      if (res.ok) {
        const data = await res.json();
        setMessages((prev) => [...prev, data.data]);
        setInputContent('');
      }
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px', height: '600px', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <div>
            <h3 style={{ fontSize: '1.15rem', color: '#0F172A' }}>
              Chat with {recipientName || 'Professional'}
            </h3>
            {bookingId && (
              <p style={{ fontSize: '0.75rem', color: '#1D4ED8', fontWeight: 600 }}>
                Linked to Booking #{bookingId}
              </p>
            )}
          </div>
          <button onClick={onClose} className="btn-icon" style={{ color: '#64748B' }}>
            <X size={20} />
          </button>
        </div>

        {/* Messages Body */}
        <div style={{ flex: 1, padding: '1.25rem', overflowY: 'auto', background: '#F8FAFC', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {loading && messages.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#94A3B8', padding: '2rem' }}>Loading conversation...</div>
          ) : messages.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#94A3B8', padding: '2rem', fontSize: '0.85rem' }}>
              No messages yet. Send a message to discuss task requirements, directions, or timing.
            </div>
          ) : (
            messages.map((m) => {
              const isMine = m.sender_id === user?.id;
              return (
                <div 
                  key={m.id}
                  style={{
                    alignSelf: isMine ? 'flex-end' : 'flex-start',
                    maxWidth: '80%',
                    background: isMine ? '#1D4ED8' : '#FFFFFF',
                    color: isMine ? '#FFFFFF' : '#0F172A',
                    padding: '0.65rem 0.95rem',
                    borderRadius: '12px',
                    borderBottomRightRadius: isMine ? '2px' : '12px',
                    borderBottomLeftRadius: isMine ? '12px' : '2px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                    border: isMine ? 'none' : '1px solid #E2E8F0'
                  }}
                >
                  <div style={{ fontSize: '0.9rem', lineHeight: 1.4 }}>{m.content}</div>
                  <div style={{
                    fontSize: '0.65rem',
                    color: isMine ? 'rgba(255,255,255,0.7)' : '#94A3B8',
                    textAlign: 'right',
                    marginTop: '0.25rem'
                  }}>
                    {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Input Bar */}
        <form onSubmit={handleSendMessage} style={{ padding: '0.75rem 1rem', background: '#FFFFFF', borderTop: '1px solid #E2E8F0', display: 'flex', gap: '0.5rem' }}>
          <input 
            type="text"
            className="form-control"
            placeholder="Type your message..."
            value={inputContent}
            onChange={(e) => setInputContent(e.target.value)}
            style={{ borderRadius: '9999px', paddingLeft: '1rem' }}
          />
          <button 
            type="submit" 
            disabled={sending || !inputContent.trim()}
            className="btn btn-primary btn-icon"
            style={{ borderRadius: '50%', flexShrink: 0 }}
          >
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}
