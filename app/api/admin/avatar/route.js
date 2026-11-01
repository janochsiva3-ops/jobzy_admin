import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import getDb, { logAccountAction } from '@/lib/db';
import { requireRole } from '@/lib/auth';

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

/**
 * Inspects file magic bytes to verify genuine JPG, PNG, or WebP content on the server.
 */
function detectImageFormat(buffer) {
  if (!buffer || buffer.length < 12) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { mime: 'image/png', ext: 'png' };
  }

  // WebP: "RIFF" .... "WEBP"
  const riff = buffer.subarray(0, 4).toString('ascii');
  const webp = buffer.subarray(8, 12).toString('ascii');
  if (riff === 'RIFF' && webp === 'WEBP') {
    return { mime: 'image/webp', ext: 'webp' };
  }

  return null;
}

function deleteExistingAvatarFile(avatarUrl) {
  if (!avatarUrl || typeof avatarUrl !== 'string') return;
  const prefixes = ['/api/uploads/avatars/', '/uploads/avatars/'];
  for (const prefix of prefixes) {
    if (avatarUrl.startsWith(prefix)) {
      const filename = path.basename(avatarUrl.slice(prefix.length));
      const fullPath = path.join(process.cwd(), 'public', 'uploads', 'avatars', filename);
      try {
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
        }
      } catch (e) {
        console.error('Failed to delete old avatar file:', e);
      }
    }
  }
}

export async function POST(request) {
  const auth = requireRole(request, 'admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const contentType = request.headers.get('content-type') || '';
    let buffer = null;
    let declaredMime = '';
    let declaredOriginalSize = 0;
    let targetUserId = null;

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      targetUserId = formData.get('userId');
      if (targetUserId && targetUserId !== auth.user.id) {
        return NextResponse.json(
          { error: 'Administrators can only change their own profile picture through this menu.' },
          { status: 403 }
        );
      }

      const file = formData.get('file');
      const origSizeField = formData.get('originalSize');
      const origTypeField = formData.get('originalType');

      if (!file || typeof file.arrayBuffer !== 'function') {
        return NextResponse.json({ error: 'Please select an image file to upload.' }, { status: 400 });
      }

      declaredMime = (origTypeField || file.type || '').toLowerCase();
      declaredOriginalSize = origSizeField ? Number(origSizeField) : file.size;

      if (declaredOriginalSize > MAX_FILE_SIZE_BYTES || file.size > MAX_FILE_SIZE_BYTES) {
        return NextResponse.json(
          { error: 'Image size exceeds the 5 MB limit. Please choose a JPG, PNG, or WebP file up to 5 MB.' },
          { status: 400 }
        );
      }

      if (declaredMime && !ALLOWED_MIME_TYPES.has(declaredMime)) {
        return NextResponse.json(
          { error: 'Unsupported file format. Only JPG, PNG, and WebP images are allowed.' },
          { status: 400 }
        );
      }

      const arrayBuffer = await file.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    } else {
      const body = await request.json().catch(() => ({}));
      targetUserId = body.userId;
      if (targetUserId && targetUserId !== auth.user.id) {
        return NextResponse.json(
          { error: 'Administrators can only change their own profile picture through this menu.' },
          { status: 403 }
        );
      }

      const { imageDataUrl, originalSize, originalType } = body;
      if (!imageDataUrl || typeof imageDataUrl !== 'string') {
        return NextResponse.json({ error: 'Please provide a valid image file.' }, { status: 400 });
      }

      if (originalSize && Number(originalSize) > MAX_FILE_SIZE_BYTES) {
        return NextResponse.json(
          { error: 'Image size exceeds the 5 MB limit. Please choose a JPG, PNG, or WebP file up to 5 MB.' },
          { status: 400 }
        );
      }

      const match = imageDataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) {
        return NextResponse.json({ error: 'Invalid image data format.' }, { status: 400 });
      }

      declaredMime = (originalType || match[1] || '').toLowerCase();
      if (!ALLOWED_MIME_TYPES.has(declaredMime)) {
        return NextResponse.json(
          { error: 'Unsupported file format. Only JPG, PNG, and WebP images are allowed.' },
          { status: 400 }
        );
      }

      buffer = Buffer.from(match[2], 'base64');
    }

    if (!buffer || buffer.length === 0) {
      return NextResponse.json({ error: 'Uploaded image file is empty.' }, { status: 400 });
    }

    if (buffer.length > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: 'Image size exceeds the 5 MB limit. Please choose a JPG, PNG, or WebP file up to 5 MB.' },
        { status: 400 }
      );
    }

    // Validate actual binary signature (magic bytes)
    const detected = detectImageFormat(buffer);
    if (!detected) {
      return NextResponse.json(
        { error: 'Invalid image file. Only genuine JPG, PNG, and WebP images are allowed.' },
        { status: 400 }
      );
    }

    const db = getDb();
    const currentAdmin = db
      .prepare("SELECT id, name, email, role, avatar FROM users WHERE id = ? AND role = 'admin'")
      .get(auth.user.id);

    if (!currentAdmin) {
      return NextResponse.json({ error: 'Administrator account not found.' }, { status: 404 });
    }

    const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'avatars');
    fs.mkdirSync(uploadsDir, { recursive: true });

    const safeAdminId = String(auth.user.id).replace(/[^a-zA-Z0-9_-]/g, '');
    const filename = `admin-${safeAdminId}-${Date.now()}.${detected.ext}`;
    const filePath = path.join(uploadsDir, filename);

    fs.writeFileSync(filePath, buffer);

    const newAvatarUrl = `/api/uploads/avatars/${filename}`;

    // Update ONLY the logged-in administrator's avatar column
    db.prepare("UPDATE users SET avatar = ? WHERE id = ? AND role = 'admin'").run(
      newAvatarUrl,
      auth.user.id
    );

    // Clean up previous uploaded file after DB update succeeds
    if (currentAdmin.avatar && currentAdmin.avatar !== newAvatarUrl) {
      deleteExistingAvatarFile(currentAdmin.avatar);
    }

    logAccountAction({
      targetUserId: auth.user.id,
      targetUserName: currentAdmin.name,
      targetUserEmail: currentAdmin.email,
      targetUserRole: 'admin',
      action: 'update_admin_avatar',
      performedBy: auth.user.id,
      performedByName: currentAdmin.name,
      reason: 'Updated administrator profile picture',
      details: { avatarUrl: newAvatarUrl, format: detected.mime, sizeBytes: buffer.length }
    });

    const updatedUser = db
      .prepare('SELECT id, name, email, role, phone, district, city, address, avatar, status FROM users WHERE id = ?')
      .get(auth.user.id);

    return NextResponse.json({
      success: true,
      message: 'Profile picture updated successfully.',
      avatarUrl: newAvatarUrl,
      user: updatedUser
    });
  } catch (err) {
    console.error('Error uploading admin avatar:', err);
    return NextResponse.json(
      { error: 'Failed to upload profile picture. Your previous picture has been preserved.' },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  const auth = requireRole(request, 'admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const body = await request.json().catch(() => ({}));
    const requestedUserId = body.userId || searchParams.get('userId');

    if (requestedUserId && requestedUserId !== auth.user.id) {
      return NextResponse.json(
        { error: 'Administrators can only remove their own profile picture through this menu.' },
        { status: 403 }
      );
    }

    const db = getDb();
    const currentAdmin = db
      .prepare("SELECT id, name, email, role, avatar FROM users WHERE id = ? AND role = 'admin'")
      .get(auth.user.id);

    if (!currentAdmin) {
      return NextResponse.json({ error: 'Administrator account not found.' }, { status: 404 });
    }

    // Set avatar to NULL (keep name, role badge, and all other account details unchanged)
    db.prepare("UPDATE users SET avatar = NULL WHERE id = ? AND role = 'admin'").run(auth.user.id);

    if (currentAdmin.avatar) {
      deleteExistingAvatarFile(currentAdmin.avatar);
    }

    logAccountAction({
      targetUserId: auth.user.id,
      targetUserName: currentAdmin.name,
      targetUserEmail: currentAdmin.email,
      targetUserRole: 'admin',
      action: 'remove_admin_avatar',
      performedBy: auth.user.id,
      performedByName: currentAdmin.name,
      reason: 'Removed administrator profile picture'
    });

    const updatedUser = db
      .prepare('SELECT id, name, email, role, phone, district, city, address, avatar, status FROM users WHERE id = ?')
      .get(auth.user.id);

    return NextResponse.json({
      success: true,
      message: 'Profile picture removed.',
      avatarUrl: null,
      user: updatedUser
    });
  } catch (err) {
    console.error('Error removing admin avatar:', err);
    return NextResponse.json(
      { error: 'Failed to remove profile picture. Please try again.' },
      { status: 500 }
    );
  }
}

