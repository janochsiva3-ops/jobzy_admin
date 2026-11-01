import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import getDb from '@/lib/db';
import { generateToken } from '@/lib/auth';
import { evaluateProviderSubscriptions } from '@/lib/paymentService';

export async function POST(request) {
  try {
    const { email, password, expectedRole } = await request.json();
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
    }

    const db = getDb();
    evaluateProviderSubscriptions();

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
    if (!user) {
      return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
    }

    if (user.status === 'removed') {
      return NextResponse.json({ error: 'This account has been removed by administration. Please contact support@jobzy.lk.' }, { status: 403 });
    }

    if (user.status === 'suspended') {
      const isSubscriptionOnlySuspension =
        user.role === 'provider' &&
        user.suspension_type === 'subscription_unpaid' &&
        !user.manual_suspended;
      if (!isSubscriptionOnlySuspension) {
        const reasonText = user.manual_suspension_reason || user.suspension_reason;
        return NextResponse.json({
          error: reasonText
            ? `This account has been suspended by administration (${reasonText}). Please contact support@jobzy.lk.`
            : 'This account has been suspended by administration. Please contact support@jobzy.lk.'
        }, { status: 403 });
      }
    }

    if (user.invitation_token && !user.invitation_accepted_at) {
      return NextResponse.json({
        error: 'Please use your secure invitation link to verify your email and set your password before logging in.'
      }, { status: 403 });
    }

    const validPassword = bcrypt.compareSync(password, user.password_hash);
    if (!validPassword) {
      return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
    }

    if (expectedRole && user.role !== expectedRole) {
      const msg =
        expectedRole === 'admin'
          ? 'This account does not have administrator access.'
          : `Access denied for ${user.role} account on this login portal.`;
      return NextResponse.json({ error: msg }, { status: 403 });
    }

    const token = generateToken(user);
    const userSafe = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
      district: user.district,
      city: user.city,
      address: user.address,
      avatar: user.avatar,
      status: user.status,
      suspension_type: user.suspension_type || null,
      manual_suspended: user.manual_suspended || 0,
      manual_suspension_reason: user.manual_suspension_reason || null,
      subscription_suspended: user.subscription_suspended || 0
    };

    const response = NextResponse.json({
      message: 'Login successful',
      token,
      user: userSafe
    });

    response.cookies.set('jobzy_token', token, {
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60
    });

    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Server error during login.' }, { status: 500 });
  }
}
