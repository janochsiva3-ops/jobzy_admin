import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import getDb from '@/lib/db';
import crypto from 'crypto';

export async function POST(request) {
  try {
    const { email } = await request.json();
    if (!email || !email.trim()) {
      return NextResponse.json({ error: 'Please enter your registered email address.' }, { status: 400 });
    }

    const cleanEmail = email.toLowerCase().trim();
    const db = getDb();
    const user = db.prepare('SELECT id, name, email, role FROM users WHERE email = ?').get(cleanEmail);

    // Standard secure pattern: return friendly success without disclosing if email exists
    return NextResponse.json({
      message: 'If an account exists with this email address, password reset instructions have been dispatched. Please check your inbox and spam folder.'
    });
  } catch (err) {
    console.error('Password reset request error:', err);
    return NextResponse.json({ error: 'Failed to process password recovery.' }, { status: 500 });
  }
}

