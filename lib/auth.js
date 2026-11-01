import jwt from 'jsonwebtoken';
import getDb from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'jobzy_lk_super_secure_jwt_secret_key_2026';

export function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
      tokenVersion: user.token_version || 1
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

export function verifyAuth(request) {
  const authHeader = request.headers?.get?.('authorization');
  let token = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  }

  if (!token && request.cookies?.get) {
    token = request.cookies.get('jobzy_token')?.value || null;
  }

  if (!token) {
    const cookieHeader = request.headers?.get?.('cookie');
    if (cookieHeader) {
      const match = cookieHeader.match(/(?:^|;\s*)jobzy_token=([^;]+)/);
      if (match) {
        token = decodeURIComponent(match[1]);
      }
    }
  }

  if (!token) {
    return { user: null, error: 'Authentication required. Please log in.', status: 401 };
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const db = getDb();
    const user = db.prepare(`
      SELECT id, name, email, role, phone, district, city, address, avatar, status, token_version,
             suspension_type, manual_suspended, manual_suspension_reason, manual_suspended_at,
             subscription_suspended, subscription_suspended_at, suspension_reason
      FROM users WHERE id = ?
    `).get(decoded.id);

    if (!user) {
      return { user: null, error: 'User account not found.', status: 404 };
    }
    if (user.status === 'removed') {
      return { user: null, error: 'This account has been removed by administration.', status: 403 };
    }
    if (user.status === 'suspended') {
      const isSubscriptionOnlySuspension =
        user.role === 'provider' &&
        user.suspension_type === 'subscription_unpaid' &&
        !user.manual_suspended;
      if (!isSubscriptionOnlySuspension) {
        return {
          user: null,
          error: user.manual_suspension_reason
            ? `Account suspended by administrator: ${user.manual_suspension_reason}`
            : 'Account suspended by administrator.',
          status: 403
        };
      }
    }
    if (decoded.tokenVersion !== undefined && decoded.tokenVersion !== (user.token_version || 1)) {
      return { user: null, error: 'Your session has expired or been revoked. Please log in again.', status: 401 };
    }

    return { user, error: null, status: 200 };
  } catch (err) {
    return { user: null, error: 'Invalid or expired session token.', status: 401 };
  }
}

export function requireRole(request, ...allowedRoles) {
  const auth = verifyAuth(request);
  if (auth.error) {
    return auth;
  }
  if (!allowedRoles.includes(auth.user.role)) {
    return {
      user: null,
      error: `Access denied. Requires one of: [${allowedRoles.join(', ')}].`,
      status: 403
    };
  }
  return auth;
}
