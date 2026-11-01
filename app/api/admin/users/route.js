import { NextResponse } from 'next/server';
import getDb, { logAccountAction } from '@/lib/db';
import { requireRole } from '@/lib/auth';

export async function GET(request) {
  const auth = requireRole(request, 'admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const role = searchParams.get('role');
  const status = searchParams.get('status');
  const search = searchParams.get('search');

  const db = getDb();
  let query = `
    SELECT u.id, u.name, u.email, u.role, u.phone, u.district, u.city, u.status, u.created_at,
           p.title, p.verification_status, p.rating_avg, p.is_sponsored
    FROM users u
    LEFT JOIN provider_profiles p ON u.id = p.id
    WHERE 1=1
  `;
  const params = [];

  if (role && role !== 'all') {
    query += ` AND u.role = ?`;
    params.push(role);
  }
  if (status === 'removed') {
    query += ` AND u.status = 'removed'`;
  } else if (status && status !== 'all') {
    query += ` AND u.status = ?`;
    params.push(status);
  } else {
    query += ` AND u.status != 'removed'`;
  }
  if (search && search.trim()) {
    query += ` AND (u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)`;
    params.push(`%${search.trim()}%`, `%${search.trim()}%`, `%${search.trim()}%`);
  }

  query += ` ORDER BY u.created_at DESC`;

  const users = db.prepare(query).all(...params);
  return NextResponse.json(users);
}

export async function PUT(request) {
  const auth = requireRole(request, 'admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { userId, status, reason } = await request.json();
  if (!userId || !['active', 'suspended', 'removed'].includes(status)) {
    return NextResponse.json({ error: 'Valid userId and status are required.' }, { status: 400 });
  }

  if (userId === auth.user.id && status !== 'active') {
    return NextResponse.json({ error: 'Administrators cannot suspend or remove their own account.' }, { status: 403 });
  }

  const db = getDb();
  const targetUser = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!targetUser) {
    return NextResponse.json({ error: 'User not found.' }, { status: 404 });
  }

  if (targetUser.role === 'admin' && status !== 'active') {
    const activeAdminsCount = db.prepare("SELECT COUNT(*) as cnt FROM users WHERE role = 'admin' AND status = 'active'").get().cnt;
    if (activeAdminsCount <= 1) {
      return NextResponse.json({ error: 'Cannot suspend or remove the last active administrator.' }, { status: 403 });
    }
  }

  if ((status === 'suspended' || status === 'removed') && (!reason || !reason.trim())) {
    return NextResponse.json({ error: 'A reason is required when suspending or removing an account.' }, { status: 400 });
  }

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE users
    SET status = ?,
        suspension_reason = CASE WHEN ? = 'suspended' THEN ? ELSE suspension_reason END,
        suspended_at = CASE WHEN ? = 'suspended' THEN ? ELSE suspended_at END,
        suspended_by = CASE WHEN ? = 'suspended' THEN ? ELSE suspended_by END,
        removal_reason = CASE WHEN ? = 'removed' THEN ? ELSE removal_reason END,
        removed_at = CASE WHEN ? = 'removed' THEN ? ELSE removed_at END,
        removed_by = CASE WHEN ? = 'removed' THEN ? ELSE removed_by END,
        token_version = COALESCE(token_version, 1) + 1
    WHERE id = ?
  `).run(
    status,
    status, reason || null,
    status, now,
    status, auth.user.id,
    status, reason || null,
    status, now,
    status, auth.user.id,
    userId
  );

  logAccountAction({
    targetUserId: userId,
    targetUserName: targetUser.name,
    targetUserEmail: targetUser.email,
    targetUserRole: targetUser.role,
    action: status === 'suspended' ? 'suspend_account' : status === 'removed' ? 'remove_account' : 'reactivate_account',
    performedBy: auth.user.id,
    performedByName: auth.user.name,
    reason: reason || `Updated status to ${status}`
  });

  return NextResponse.json({ message: `User status updated to ${status}.` });
}
