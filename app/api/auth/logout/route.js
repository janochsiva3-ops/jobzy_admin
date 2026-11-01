import { NextResponse } from 'next/server';

export async function POST() {
  const response = NextResponse.json({ message: 'Logged out successfully.' });
  response.cookies.set('jobzy_token', '', {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    maxAge: 0
  });
  return response;
}

