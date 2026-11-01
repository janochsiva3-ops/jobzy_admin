import { NextResponse } from 'next/server';
import getDb, { createNotification } from '@/lib/db';
import { verifyAuth } from '@/lib/auth';

export async function GET(request) {
  const auth = verifyAuth(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const bookingId = searchParams.get('bookingId');
  const otherUserId = searchParams.get('otherUserId');

  const db = getDb();
  let query = `
    SELECT m.*, u.name as sender_name, u.avatar as sender_avatar
    FROM messages m
    JOIN users u ON m.sender_id = u.id
    WHERE (m.sender_id = ? OR m.receiver_id = ?)
  `;
  const params = [auth.user.id, auth.user.id];

  if (bookingId) {
    query += ` AND m.booking_id = ?`;
    params.push(bookingId);
  } else if (otherUserId) {
    query += ` AND (m.sender_id = ? OR m.receiver_id = ?)`;
    params.push(otherUserId, otherUserId);
  }

  query += ` ORDER BY m.created_at ASC`;

  const messages = db.prepare(query).all(...params);

  db.prepare(`
    UPDATE messages SET is_read = 1
    WHERE receiver_id = ? AND is_read = 0
  `).run(auth.user.id);

  return NextResponse.json(messages);
}

export async function POST(request) {
  const auth = verifyAuth(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { bookingId, receiverId, content } = await request.json();
  if (!receiverId || !content || !content.trim()) {
    return NextResponse.json({ error: 'Recipient and message content are required.' }, { status: 400 });
  }

  const db = getDb();
  const messageId = 'msg-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO messages (id, booking_id, sender_id, receiver_id, content, is_read, created_at)
    VALUES (?, ?, ?, ?, ?, 0, ?)
  `).run(messageId, bookingId || null, auth.user.id, receiverId, content.trim(), now);

  createNotification(
    receiverId,
    'message',
    `New message from ${auth.user.name}`,
    content.trim().length > 60 ? content.trim().substring(0, 57) + '...' : content.trim(),
    bookingId ? `/customer/dashboard` : `/messages`
  );

  return NextResponse.json({
    message: 'Message sent.',
    data: {
      id: messageId,
      booking_id: bookingId,
      sender_id: auth.user.id,
      receiver_id: receiverId,
      content: content.trim(),
      created_at: now
    }
  }, { status: 201 });
}
