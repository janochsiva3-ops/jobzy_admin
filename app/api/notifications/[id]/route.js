import { NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { requireRole } from '@/lib/auth';

export async function DELETE(request, { params }) {
  const { id } = await params;

  // Enforce administrator authentication on the server
  const auth = requireRole(request, 'admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'Notification ID is required.' }, { status: 400 });
  }

  try {
    const db = getDb();
    const existing = db.prepare('SELECT id, user_id FROM notifications WHERE id = ?').get(id);

    if (!existing) {
      return NextResponse.json({ error: 'Notification not found in your inbox.' }, { status: 404 });
    }

    if (existing.user_id !== auth.user.id) {
      return NextResponse.json(
        { error: 'Forbidden: You can only delete notifications from your own administrator inbox.' },
        { status: 403 }
      );
    }

    db.prepare('DELETE FROM notifications WHERE id = ? AND user_id = ?').run(id, auth.user.id);

    const remainingNotifications = db
      .prepare(`
        SELECT * FROM notifications
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT 200
      `)
      .all(auth.user.id);

    const unreadCount = db
      .prepare(`
        SELECT COUNT(*) as count FROM notifications
        WHERE user_id = ? AND is_read = 0
      `)
      .get(auth.user.id).count;

    return NextResponse.json({
      success: true,
      message: 'Notification deleted from your inbox.',
      deletedCount: 1,
      deletedIds: [id],
      notifications: remainingNotifications,
      unreadCount
    });
  } catch (err) {
    console.error('Error deleting notification:', err);
    return NextResponse.json(
      { error: 'Failed to delete notification. Please try again.' },
      { status: 500 }
    );
  }
}

