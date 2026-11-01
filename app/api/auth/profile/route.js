import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import getDb, { logAccountAction } from '@/lib/db';
import { verifyAuth } from '@/lib/auth';

function deleteExistingAvatarFile(avatarUrl) {
  if (!avatarUrl || typeof avatarUrl !== 'string') return;
  // Never delete shared default images or external CDN assets
  if (
    avatarUrl.startsWith('http://') ||
    avatarUrl.startsWith('https://') ||
    avatarUrl.startsWith('/images/') ||
    avatarUrl.startsWith('/favicon') ||
    avatarUrl.startsWith('/icons')
  ) {
    return;
  }
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

export async function PUT(request) {
  const auth = verifyAuth(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const { name, phone, district, city, address, avatar, removeAvatar } = body;
    const db = getDb();

    let user = db.prepare('SELECT id, name, email, role, avatar FROM users WHERE id = ?').get(auth.user.id);
    if (!user && auth.user.email) {
      user = db.prepare('SELECT id, name, email, role, avatar FROM users WHERE lower(trim(email)) = lower(trim(?))').get(auth.user.email);
    }
    if (!user) {
      return NextResponse.json({ error: 'User account not found.' }, { status: 404 });
    }

    let finalAvatar = user.avatar;
    if (removeAvatar === true || avatar === null || avatar === '') {
      if (user.avatar) {
        deleteExistingAvatarFile(user.avatar);
      }
      finalAvatar = null;
    } else if (avatar !== undefined) {
      if (user.avatar && user.avatar !== avatar) {
        deleteExistingAvatarFile(user.avatar);
      }
      finalAvatar = avatar;
    }

    db.prepare(`
      UPDATE users
      SET name = COALESCE(?, name),
          phone = COALESCE(?, phone),
          district = COALESCE(?, district),
          city = COALESCE(?, city),
          address = COALESCE(?, address),
          avatar = ?
      WHERE id = ?
    `).run(name, phone, district, city, address, finalAvatar, user.id);

    const updated = db.prepare('SELECT id, name, email, role, phone, district, city, address, avatar, status FROM users WHERE id = ?').get(user.id);
    return NextResponse.json({ message: 'Profile updated successfully.', user: updated });
  } catch (err) {
    console.error('Profile update error:', err);
    return NextResponse.json({ error: 'Could not update profile.' }, { status: 500 });
  }
}

export async function DELETE(request) {
  const auth = verifyAuth(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const db = getDb();
    let user = db.prepare('SELECT id, name, email, role, avatar FROM users WHERE id = ?').get(auth.user.id);
    if (!user && auth.user.email) {
      user = db.prepare('SELECT id, name, email, role, avatar FROM users WHERE lower(trim(email)) = lower(trim(?))').get(auth.user.email);
    }
    if (!user) {
      return NextResponse.json({ error: 'User account not found.' }, { status: 404 });
    }

    // If picture is already removed, return a successful result
    if (!user.avatar) {
      return NextResponse.json({
        success: true,
        alreadyRemoved: true,
        message: 'Profile picture is already removed.',
        avatarUrl: null,
        user: { ...user, avatar: null }
      });
    }

    const oldAvatar = user.avatar;

    // Remove only their profile picture reference; preserve professional profile and all other details
    db.prepare('UPDATE users SET avatar = NULL WHERE id = ?').run(user.id);

    deleteExistingAvatarFile(oldAvatar);

    try {
      logAccountAction({
        targetUserId: user.id,
        targetUserName: user.name,
        targetUserEmail: user.email,
        targetUserRole: user.role,
        action: 'remove_avatar',
        performedBy: auth.user.id,
        performedByName: user.name,
        reason: 'Removed profile picture'
      });
    } catch (_) {}

    const updated = db.prepare('SELECT id, name, email, role, phone, district, city, address, avatar, status FROM users WHERE id = ?').get(user.id);
    return NextResponse.json({
      success: true,
      message: 'Profile picture removed successfully.',
      avatarUrl: null,
      user: updated
    });
  } catch (err) {
    console.error('Profile picture removal error:', err);
    return NextResponse.json({ error: 'Failed to remove profile picture.' }, { status: 500 });
  }
}
