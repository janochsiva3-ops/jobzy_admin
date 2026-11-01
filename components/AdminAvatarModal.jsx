'use client';
import React, { useState, useEffect, useRef } from 'react';
import { X, Upload, Trash2, CheckCircle2, AlertTriangle, ZoomIn, User, Camera } from 'lucide-react';

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const CROP_BOX_SIZE = 240;
const OUTPUT_SIZE = 400;

export function hasCustomAdminAvatar(user) {
  return Boolean(user?.avatar && String(user.avatar).trim().length > 0);
}

export function getAdminInitials(name) {
  if (!name || typeof name !== 'string') return '';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Circular avatar for the logged-in administrator.
 * Renders the custom avatar image when present, or a clean initials/icon avatar when removed.
 */
export function AdminAvatarCircle({ user, size = 28 }) {
  const [imgError, setImgError] = useState(false);
  const avatarUrl = user?.avatar && String(user.avatar).trim() ? String(user.avatar).trim() : null;

  useEffect(() => {
    setImgError(false);
  }, [avatarUrl]);

  if (avatarUrl && !imgError) {
    return (
      <img
        src={avatarUrl}
        alt={user?.name || 'Administrator'}
        onError={() => setImgError(true)}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          borderRadius: '50%',
          objectFit: 'cover',
          flexShrink: 0,
          display: 'block'
        }}
      />
    );
  }

  const initials = getAdminInitials(user?.name);
  const fontSize = Math.max(11, Math.round(size * 0.4));

  return (
    <span
      aria-label={user?.name || 'Administrator avatar'}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: '50%',
        background: '#1E3A8A',
        color: '#FFFFFF',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 800,
        fontSize: `${fontSize}px`,
        letterSpacing: '0.02em',
        flexShrink: 0,
        userSelect: 'none'
      }}
    >
      {initials ? initials : <User size={Math.round(size * 0.55)} />}
    </span>
  );
}

/**
 * Modal for uploading, square-cropping, and saving a new administrator profile picture.
 */
export function ChangeAdminAvatarModal({ isOpen, user, token, onClose, onSaved }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewSrc, setPreviewSrc] = useState(null);
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const fileInputRef = useRef(null);
  const imageElementRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedFile(null);
    setPreviewSrc(null);
    setNaturalSize({ width: 0, height: 0 });
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setSubmitting(false);
    setError('');
    setSuccessMsg('');
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (previewSrc && previewSrc.startsWith('blob:')) {
        URL.revokeObjectURL(previewSrc);
      }
    };
  }, [previewSrc]);

  if (!isOpen) return null;

  // Compute base scale so the shorter side fills the CROP_BOX_SIZE square
  const getBaseScale = () => {
    if (!naturalSize.width || !naturalSize.height) return 1;
    return Math.max(CROP_BOX_SIZE / naturalSize.width, CROP_BOX_SIZE / naturalSize.height);
  };

  // Clamp pan offset so the image always covers the entire square crop area
  const clampOffset = (nextX, nextY, nextZoom = zoom, nat = naturalSize) => {
    if (!nat.width || !nat.height) return { x: 0, y: 0 };
    const baseScale = Math.max(CROP_BOX_SIZE / nat.width, CROP_BOX_SIZE / nat.height);
    const renderedW = nat.width * baseScale * nextZoom;
    const renderedH = nat.height * baseScale * nextZoom;
    const maxOffsetX = Math.max(0, (renderedW - CROP_BOX_SIZE) / 2);
    const maxOffsetY = Math.max(0, (renderedH - CROP_BOX_SIZE) / 2);
    return {
      x: Math.min(maxOffsetX, Math.max(-maxOffsetX, nextX)),
      y: Math.min(maxOffsetY, Math.max(-maxOffsetY, nextY))
    };
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError('');
    setSuccessMsg('');

    const fileType = (file.type || '').toLowerCase();
    if (!ALLOWED_MIME_TYPES.includes(fileType)) {
      setError('Unsupported file format. Please upload a JPG, PNG, or WebP image.');
      e.target.value = '';
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError('File is too large. Maximum allowed size is 5 MB.');
      e.target.value = '';
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      imageElementRef.current = img;
      const nat = { width: img.naturalWidth || img.width, height: img.naturalHeight || img.height };
      setNaturalSize(nat);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
      setSelectedFile(file);
      setPreviewSrc((prev) => {
        if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
        return objectUrl;
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      setError('Could not load the selected image file. Please try another JPG, PNG, or WebP image.');
    };
    img.src = objectUrl;
  };

  const handlePointerDown = (clientX, clientY) => {
    if (!previewSrc || submitting) return;
    setDragging(true);
    setDragStart({ x: clientX - offset.x, y: clientY - offset.y });
  };

  const handlePointerMove = (clientX, clientY) => {
    if (!dragging) return;
    const nextX = clientX - dragStart.x;
    const nextY = clientY - dragStart.y;
    setOffset(clampOffset(nextX, nextY));
  };

  const handlePointerUp = () => {
    setDragging(false);
  };

  const handleZoomChange = (newZoomVal) => {
    const nextZoom = parseFloat(newZoomVal) || 1;
    setZoom(nextZoom);
    setOffset((prev) => clampOffset(prev.x, prev.y, nextZoom));
  };

  const buildCroppedBlob = () =>
    new Promise((resolve, reject) => {
      const img = imageElementRef.current;
      if (!img || !selectedFile) {
        return reject(new Error('Please select an image first.'));
      }

      const canvas = document.createElement('canvas');
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return reject(new Error('Could not initialize image cropper.'));
      }

      const baseScale = getBaseScale();
      const totalScale = baseScale * zoom;
      const renderedW = naturalSize.width * totalScale;
      const renderedH = naturalSize.height * totalScale;

      // Top-left of image relative to the CROP_BOX_SIZE square
      const imgLeftInBox = (CROP_BOX_SIZE - renderedW) / 2 + offset.x;
      const imgTopInBox = (CROP_BOX_SIZE - renderedH) / 2 + offset.y;

      // Convert to source coordinates on natural image
      const sx = Math.max(0, -imgLeftInBox / totalScale);
      const sy = Math.max(0, -imgTopInBox / totalScale);
      const sSize = CROP_BOX_SIZE / totalScale;

      ctx.clearRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
      ctx.drawImage(
        img,
        sx,
        sy,
        Math.min(sSize, naturalSize.width - sx),
        Math.min(sSize, naturalSize.height - sy),
        0,
        0,
        OUTPUT_SIZE,
        OUTPUT_SIZE
      );

      const outputMime =
        selectedFile.type === 'image/png'
          ? 'image/png'
          : selectedFile.type === 'image/webp'
          ? 'image/webp'
          : 'image/jpeg';

      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error('Failed to generate cropped image.'));
          resolve({ blob, outputMime });
        },
        outputMime,
        0.92
      );
    });

  const handleSave = async (e) => {
    e.preventDefault();
    if (submitting) return;
    if (!selectedFile) {
      setError('Please choose a JPG, PNG, or WebP image to upload.');
      return;
    }

    setSubmitting(true);
    setError('');
    setSuccessMsg('');

    try {
      const { blob, outputMime } = await buildCroppedBlob();
      const ext = outputMime === 'image/png' ? 'png' : outputMime === 'image/webp' ? 'webp' : 'jpg';
      const formData = new FormData();
      formData.append('file', blob, `admin-avatar.${ext}`);
      formData.append('originalSize', String(selectedFile.size));
      formData.append('originalType', selectedFile.type);

      const res = await fetch('/api/admin/avatar', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: formData
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Failed to save profile picture. Your current picture has been preserved.');
      } else {
        setSuccessMsg('Profile picture updated!');
        if (onSaved) onSaved(data.user);
        setTimeout(() => {
          onClose();
        }, 450);
      }
    } catch (err) {
      setError(err.message || 'Network error while uploading image. Your current picture has been preserved.');
    } finally {
      setSubmitting(false);
    }
  };

  const baseScale = getBaseScale();
  const renderedWidth = naturalSize.width * baseScale * zoom;
  const renderedHeight = naturalSize.height * baseScale * zoom;

  return (
    <div
      className="modal-backdrop"
      onClick={() => {
        if (!submitting) onClose();
      }}
      onMouseMove={(e) => handlePointerMove(e.clientX, e.clientY)}
      onMouseUp={handlePointerUp}
      onMouseLeave={handlePointerUp}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-admin-avatar-title"
        className="modal-content"
        style={{ maxWidth: '480px', width: 'calc(100% - 32px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header" style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: '#EFF6FF',
                color: '#1D4ED8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              <Camera size={18} />
            </div>
            <div>
              <h2 id="change-admin-avatar-title" style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#0F172A' }}>
                Change Profile Picture
              </h2>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: '#64748B' }}>
                JPG, PNG or WebP up to 5 MB
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              if (!submitting) onClose();
            }}
            disabled={submitting}
            aria-label="Close dialog"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', padding: '4px' }}
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', flex: '1 1 auto', minHeight: 0 }}>
          <div className="modal-body" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {error && (
              <div
                role="alert"
                style={{
                  background: '#FEF2F2',
                  border: '1px solid #FECACA',
                  color: '#991B1B',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  fontSize: '0.84rem',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px'
                }}
              >
                <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '2px', color: '#DC2626' }} />
                <span>{error}</span>
              </div>
            )}

            {successMsg && (
              <div
                role="status"
                style={{
                  background: '#F0FDF4',
                  border: '1px solid #BBF7D0',
                  color: '#166534',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <CheckCircle2 size={16} color="#16A34A" />
                <span>{successMsg}</span>
              </div>
            )}

            {/* File Picker Button */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={submitting}
                className="btn btn-secondary btn-sm"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Upload size={15} />
                <span>{selectedFile ? 'Choose Different Image' : 'Select Image (JPG, PNG, WebP)'}</span>
              </button>

              {selectedFile && (
                <span style={{ fontSize: '0.78rem', color: '#475569', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {selectedFile.name} ({(selectedFile.size / 1024).toFixed(0)} KB)
                </span>
              )}
            </div>

            {/* Square Crop Area with Circular Avatar Overlay */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '12px',
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '12px',
                padding: '16px'
              }}
            >
              <div
                onMouseDown={(e) => handlePointerDown(e.clientX, e.clientY)}
                onTouchStart={(e) => {
                  const touch = e.touches?.[0];
                  if (touch) handlePointerDown(touch.clientX, touch.clientY);
                }}
                onTouchMove={(e) => {
                  const touch = e.touches?.[0];
                  if (touch) handlePointerMove(touch.clientX, touch.clientY);
                }}
                onTouchEnd={handlePointerUp}
                style={{
                  width: `${CROP_BOX_SIZE}px`,
                  height: `${CROP_BOX_SIZE}px`,
                  position: 'relative',
                  overflow: 'hidden',
                  borderRadius: '10px',
                  background: '#0F172A',
                  border: '2px solid #CBD5E1',
                  cursor: previewSrc ? (dragging ? 'grabbing' : 'grab') : 'default',
                  userSelect: 'none',
                  touchAction: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                {previewSrc ? (
                  <>
                    <img
                      src={previewSrc}
                      alt="Crop preview"
                      draggable={false}
                      style={{
                        width: `${renderedWidth}px`,
                        height: `${renderedHeight}px`,
                        maxWidth: 'none',
                        transform: `translate(${offset.x}px, ${offset.y}px)`,
                        pointerEvents: 'none',
                        userSelect: 'none'
                      }}
                    />
                    {/* Circular Avatar Guide Overlay inside the Square Crop Area */}
                    <div
                      aria-hidden="true"
                      style={{
                        position: 'absolute',
                        inset: 0,
                        borderRadius: '50%',
                        boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.48)',
                        border: '2px solid rgba(255, 255, 255, 0.9)',
                        pointerEvents: 'none'
                      }}
                    />
                  </>
                ) : (
                  <div style={{ textAlign: 'center', padding: '16px', color: '#CBD5E1' }}>
                    <div style={{ marginBottom: '10px', display: 'flex', justifyContent: 'center' }}>
                      <AdminAvatarCircle user={user} size={64} />
                    </div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#E2E8F0' }}>
                      Current Profile Picture
                    </div>
                    <div style={{ fontSize: '0.74rem', color: '#94A3B8', marginTop: '4px' }}>
                      Select a JPG, PNG or WebP image to preview &amp; crop
                    </div>
                  </div>
                )}
              </div>

              {previewSrc && (
                <div style={{ width: '100%', maxWidth: `${CROP_BOX_SIZE}px`, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', color: '#475569', fontWeight: 600 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <ZoomIn size={13} />
                      <span>Zoom &amp; drag to frame</span>
                    </span>
                    <span>{Math.round(zoom * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="3"
                    step="0.05"
                    value={zoom}
                    onChange={(e) => handleZoomChange(e.target.value)}
                    aria-label="Zoom image"
                    style={{ width: '100%', cursor: 'pointer' }}
                  />
                </div>
              )}
            </div>
          </div>

          <div className="modal-footer" style={{ padding: '16px 24px' }}>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting || !selectedFile}
            >
              {submitting ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Confirmation modal before removing the administrator's custom profile picture.
 */
export function RemoveAdminAvatarModal({ isOpen, user, token, onClose, onRemoved }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setSubmitting(false);
      setError('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConfirmRemove = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/admin/avatar', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Failed to remove profile picture. Please try again.');
      } else {
        if (onRemoved) onRemoved(data.user);
        onClose();
      }
    } catch (err) {
      setError('Network error while removing profile picture.');
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
        role="dialog"
        aria-modal="true"
        aria-labelledby="remove-admin-avatar-title"
        className="modal-content"
        style={{ maxWidth: '440px', width: 'calc(100% - 32px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header" style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: '#FEF2F2',
                color: '#DC2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              <Trash2 size={18} />
            </div>
            <div>
              <h2 id="remove-admin-avatar-title" style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#0F172A' }}>
                Remove profile picture?
              </h2>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: '#64748B' }}>
                Replace with your default initials avatar
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              if (!submitting) onClose();
            }}
            disabled={submitting}
            aria-label="Close dialog"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', padding: '4px' }}
          >
            <X size={20} />
          </button>
        </div>

        <div className="modal-body" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {error && (
            <div
              role="alert"
              style={{
                background: '#FEF2F2',
                border: '1px solid #FECACA',
                color: '#991B1B',
                padding: '10px 14px',
                borderRadius: '10px',
                fontSize: '0.84rem',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px'
              }}
            >
              <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '2px', color: '#DC2626' }} />
              <span>{error}</span>
            </div>
          )}

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '16px',
              background: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: '12px',
              padding: '16px'
            }}
          >
            <AdminAvatarCircle user={user} size={48} />
            <span style={{ color: '#94A3B8', fontWeight: 700 }}>&rarr;</span>
            <AdminAvatarCircle user={{ ...user, avatar: null }} size={48} />
          </div>

          <p style={{ margin: 0, fontSize: '0.86rem', color: '#334155', lineHeight: 1.5 }}>
            Are you sure you want to remove your current profile picture? Your initials avatar will be displayed until you upload a new picture.
          </p>
        </div>

        <div className="modal-footer" style={{ padding: '16px 24px' }}>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary"
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirmRemove}
            className="btn btn-danger"
            disabled={submitting}
          >
            {submitting ? 'Removing…' : 'Remove Profile Picture'}
          </button>
        </div>
      </div>
    </div>
  );
}

