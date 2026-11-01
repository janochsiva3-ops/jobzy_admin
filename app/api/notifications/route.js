import { NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { verifyAuth, requireRole } from '@/lib/auth';

export async function GET(request) {
  const auth = verifyAuth(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const db = getDb();
  const notifs = db.prepare(`
    SELECT * FROM notifications
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 200
  `).all(auth.user.id);

  const unreadCount = db.prepare(`
    SELECT COUNT(*) as count FROM notifications
    WHERE user_id = ? AND is_read = 0
  `).get(auth.user.id).count;

  return NextResponse.json({ notifications: notifs, unreadCount, totalCount: notifs.length });
}

export async function PUT(request) {
  const auth = verifyAuth(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const db = getDb();
  db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(auth.user.id);

  return NextResponse.json({ message: 'All notifications marked as read.' });
}

export async function DELETE(request) {
  // Enforce administrator authentication on the server
  const auth = requireRole(request, 'admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    let rawIds = [];
    const { searchParams } = new URL(request.url);
    const queryId = searchParams.get('id');
    const queryIds = searchParams.get('ids');

    if (queryId) {
      rawIds.push(queryId);
    }
    if (queryIds) {
      rawIds.push(...queryIds.split(',').map((s) => s.trim()).filter(Boolean));
    }

    try {
      const body = await request.json();
      if (Array.isArray(body?.ids)) {
        rawIds.push(...body.ids);
      } else if (Array.isArray(body?.notificationIds)) {
        rawIds.push(...body.notificationIds);
      } else if (typeof body?.id === 'string' && body.id.trim()) {
        rawIds.push(body.id.trim());
      }
    } catch {
      // Body is optional if query parameters were provided
    }

    const ids = Array.from(
      new Set(
        rawIds
          .filter((id) => typeof id === 'string' && id.trim().length > 0)
          .map((id) => id.trim())
      )
    );

    if (ids.length === 0) {
      return NextResponse.json(
        { error: 'Please select at least one notification to delete.' },
        { status: 400 }
      );
    }

    const db = getDb();
    const placeholders = ids.map(() => '?').join(', ');

    // Verify ownership: ensure none of the targeted notifications belong to another administrator or user
    const foundRows = db
      .prepare(`SELECT id, user_id FROM notifications WHERE id IN (${placeholders})`)
      .all(...ids);

    const foreignRow = foundRows.find((r) => r.user_id !== auth.user.id);
    if (foreignRow) {
      return NextResponse.json(
        { error: 'Forbidden: You can only delete notifications from your own administrator inbox.' },
        { status: 403 }
      );
    }

    const ownedRows = foundRows.filter((r) => r.user_id === auth.user.id);
    if (ownedRows.length === 0) {
      return NextResponse.json(
        { error: 'The selected notifications were not found in your inbox.' },
        { status: 404 }
      );
    }

    const ownedIds = ownedRows.map((r) => r.id);
    const ownedPlaceholders = ownedIds.map(() => '?').join(', ');

    // Delete only from the current administrator's inbox inside a transaction
    const result = db.transaction(() => {
      return db
        .prepare(`DELETE FROM notifications WHERE user_id = ? AND id IN (${ownedPlaceholders})`)
        .run(auth.user.id, ...ownedIds);
    })();

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
      message:
        result.changes === 1
          ? '1 notification deleted from your inbox.'
          : `${result.changes} notifications deleted from your inbox.`,
      deletedCount: result.changes,
      deletedIds: ownedIds,
      notifications: remainingNotifications,
      unreadCount
    });
  } catch (err) {
    console.error('Error deleting notifications:', err);
    return NextResponse.json(
      { error: 'Failed to delete notifications. Please try again.' },
      { status: 500 }
    );
  }
}
