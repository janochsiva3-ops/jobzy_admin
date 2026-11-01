import bcrypt from 'bcryptjs';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { syncTableToSupabase, syncAllToSupabase } from './supabaseSync.js';
import { supabase, supabaseAdmin, querySupabase } from './supabase.js';

function findRootDbPath() {
  let curr = process.cwd();
  for (let i = 0; i < 4; i++) {
    const candidate = path.resolve(curr, 'jobzy.db');
    if (fs.existsSync(candidate)) return candidate;
    curr = path.resolve(curr, '..');
  }
  return path.resolve(process.cwd(), 'jobzy.db');
}

const dbPath = findRootDbPath();

// Singleton database instance across Next.js dev server hot reloads
let dbInstance;

function getDb() {
  if (!dbInstance) {
    dbInstance = new Database(dbPath);
    dbInstance.pragma('foreign_keys = ON');
    dbInstance.pragma('journal_mode = WAL');
    initDb(dbInstance);

    // Auto-mirror mutations to Supabase in the background
    const originalPrepare = dbInstance.prepare.bind(dbInstance);
    dbInstance.prepare = function (sql) {
      const statement = originalPrepare(sql);
      const originalRun = statement.run.bind(statement);
      statement.run = function (...args) {
        const res = originalRun(...args);
        try {
          const match = sql.match(/(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+["']?([a-zA-Z0-9_]+)["']?/i);
          if (match && match[1]) {
            const table = match[1];
            syncTableToSupabase(dbInstance, table).catch(() => {});
          }
        } catch (e) {}
        return res;
      };
      return statement;
    };

    // Kick off initial background sync to Supabase
    syncAllToSupabase(dbInstance).catch(err => {
      console.warn('[Supabase] Initial sync note:', err.message);
    });
  }
  return dbInstance;
}

function initDb(db) {
  // 1. Users Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('customer', 'provider', 'admin')),
      phone TEXT,
      district TEXT,
      city TEXT,
      address TEXT,
      avatar TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'suspended', 'removed')),
      created_at TEXT NOT NULL
    );
  `);

  // 2. Service Categories
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      icon TEXT NOT NULL,
      description TEXT,
      image_url TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0
    );
  `);

  // 3. Provider Profiles
  db.exec(`
    CREATE TABLE IF NOT EXISTS provider_profiles (
      id TEXT PRIMARY KEY,
      confirmation_id TEXT UNIQUE,
      category_id TEXT,
      title TEXT NOT NULL,
      bio TEXT,
      experience_years INTEGER DEFAULT 1,
      pricing_type TEXT NOT NULL CHECK(pricing_type IN ('hourly', 'fixed', 'quote')),
      base_rate REAL DEFAULT 0,
      pricing_description TEXT,
      service_districts TEXT NOT NULL DEFAULT '[]',
      service_towns TEXT DEFAULT '',
      skills TEXT NOT NULL DEFAULT '[]',
      qualifications TEXT NOT NULL DEFAULT '[]',
      portfolio_images TEXT NOT NULL DEFAULT '[]',
      verification_status TEXT NOT NULL DEFAULT 'pending' CHECK(verification_status IN ('unsubmitted', 'pending', 'approved', 'rejected', 'suspended', 'changes_requested')),
      verification_documents TEXT NOT NULL DEFAULT '[]',
      verification_notes TEXT DEFAULT '',
      verified_at TEXT,
      reviewed_by TEXT,
      reviewed_at TEXT,
      decision_reason TEXT,
      is_sponsored INTEGER NOT NULL DEFAULT 0,
      sponsored_label TEXT DEFAULT '',
      rating_avg REAL NOT NULL DEFAULT 0,
      review_count INTEGER NOT NULL DEFAULT 0,
      availability TEXT NOT NULL DEFAULT '{}',
      FOREIGN KEY (id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
    );
  `);

  // Migrations for provider_profiles
  try { db.exec("ALTER TABLE provider_profiles ADD COLUMN confirmation_id TEXT;"); } catch (e) {}
  try { db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_confirmation_id ON provider_profiles(confirmation_id);"); } catch (e) {}
  try { db.exec("ALTER TABLE provider_profiles ADD COLUMN reviewed_by TEXT;"); } catch (e) {}
  try { db.exec("ALTER TABLE provider_profiles ADD COLUMN reviewed_at TEXT;"); } catch (e) {}
  try { db.exec("ALTER TABLE provider_profiles ADD COLUMN decision_reason TEXT;"); } catch (e) {}

  // 4. Bookings Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      booking_number TEXT UNIQUE NOT NULL,
      customer_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      service_category TEXT NOT NULL,
      service_title TEXT NOT NULL,
      task_description TEXT NOT NULL,
      service_location_type TEXT NOT NULL DEFAULT 'in_person' CHECK(service_location_type IN ('in_person', 'online')),
      address TEXT,
      district TEXT,
      city TEXT,
      scheduled_date TEXT NOT NULL,
      scheduled_time_slot TEXT NOT NULL,
      estimated_duration TEXT DEFAULT '2 hours',
      attachments TEXT DEFAULT '[]',
      pricing_type TEXT NOT NULL,
      initial_quote_estimate REAL DEFAULT 0,
      final_amount REAL DEFAULT 0,
      quote_details TEXT DEFAULT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN (
        'awaiting_payment',
        'pending',
        'awaiting_quote_approval',
        'confirmed',
        'in_progress',
        'awaiting_completion',
        'completed',
        'declined',
        'cancelled'
      )),
      payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK(payment_status IN ('unpaid', 'paid_direct', 'waived', 'refunded')),
      payment_method TEXT DEFAULT 'cash_on_service',
      booking_fee_amount REAL DEFAULT 0,
      booking_fee_status TEXT DEFAULT 'unpaid' CHECK(booking_fee_status IN ('unpaid', 'paid', 'refunded', 'waived')),
      booking_fee_payment_id TEXT,
      platform_commission_rate REAL DEFAULT 0.10,
      platform_commission_amount REAL DEFAULT 0,
      cancellation_reason TEXT DEFAULT NULL,
      cancelled_by TEXT DEFAULT NULL,
      completion_requested_at TEXT DEFAULT NULL,
      completed_at TEXT DEFAULT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE RESTRICT,
      FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE RESTRICT
    );
  `);

  // 5. Reviews Table (1 review per completed booking strictly)
  db.exec(`
    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      booking_id TEXT UNIQUE NOT NULL,
      customer_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
      review_text TEXT NOT NULL,
      response_text TEXT DEFAULT NULL,
      is_moderated INTEGER NOT NULL DEFAULT 0,
      is_hidden INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
      FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // 6. Messages Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      booking_id TEXT,
      sender_id TEXT NOT NULL,
      receiver_id TEXT NOT NULL,
      content TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
      FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // 7. Notifications Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      link TEXT,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // 8. Platform Settings Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS platform_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      description TEXT,
      updated_at TEXT NOT NULL
    );
  `);

  // 9. Advertisements & Promoted Listings
  db.exec(`
    CREATE TABLE IF NOT EXISTS advertisements (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      banner_text TEXT NOT NULL,
      link_url TEXT NOT NULL,
      image_url TEXT,
      placement TEXT NOT NULL CHECK(placement IN ('home_hero', 'search_sidebar', 'footer_banner')),
      is_active INTEGER NOT NULL DEFAULT 1,
      impressions INTEGER NOT NULL DEFAULT 0,
      clicks INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
  `);

  // 10. Financial Accounting Ledger (Recording platform fees without false online claims)
  db.exec(`
    CREATE TABLE IF NOT EXISTS financial_ledger (
      id TEXT PRIMARY KEY,
      booking_id TEXT,
      provider_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('booking_commission', 'registration_fee', 'promotion_fee')),
      gross_amount REAL NOT NULL,
      commission_rate REAL NOT NULL DEFAULT 0.10,
      commission_amount REAL NOT NULL,
      net_provider_amount REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'recorded_due' CHECK(status IN ('recorded_due', 'settled', 'waived')),
      notes TEXT,
      recorded_at TEXT NOT NULL,
      FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL,
      FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  
  // 11. Platform Fee Settings
  db.exec(`
    CREATE TABLE IF NOT EXISTS platform_fee_settings (
      id TEXT PRIMARY KEY,
      fee_type TEXT UNIQUE NOT NULL CHECK(fee_type IN ('provider_registration', 'provider_subscription', 'customer_booking')),
      title TEXT NOT NULL,
      description TEXT,
      amount REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'LKR',
      is_enabled INTEGER NOT NULL DEFAULT 1,
      effective_date TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      grace_period_days INTEGER DEFAULT 7,
      transition_date TEXT DEFAULT NULL,
      gateway_mode TEXT DEFAULT 'test' CHECK(gateway_mode IN ('test', 'live')),
      payhere_merchant_id TEXT DEFAULT '',
      payhere_merchant_secret TEXT DEFAULT '',
      updated_by TEXT,
      updated_at TEXT NOT NULL
    );
  `);

  // 12. Fee Change History (Full audit trail)
  db.exec(`
    CREATE TABLE IF NOT EXISTS fee_change_history (
      id TEXT PRIMARY KEY,
      fee_type TEXT NOT NULL,
      previous_amount REAL NOT NULL,
      new_amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'LKR',
      effective_date TEXT NOT NULL,
      version INTEGER NOT NULL,
      changed_by TEXT NOT NULL,
      reason TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
    );
  `);

  // 13. Transactions Ledger
  db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      transaction_reference TEXT UNIQUE NOT NULL,
      user_id TEXT NOT NULL,
      user_name TEXT,
      user_email TEXT,
      user_role TEXT NOT NULL CHECK(user_role IN ('customer', 'provider')),
      fee_type TEXT NOT NULL CHECK(fee_type IN ('provider_registration', 'provider_subscription', 'customer_booking')),
      fee_version INTEGER NOT NULL DEFAULT 1,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'LKR',
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'successful', 'failed', 'refunded', 'cancelled')),
      payment_method TEXT DEFAULT 'test_gateway',
      gateway_reference TEXT,
      gateway_fee REAL DEFAULT 0,
      gateway_response TEXT DEFAULT '{}',
      related_id TEXT,
      related_type TEXT CHECK(related_type IN ('booking', 'registration', 'subscription')),
      metadata TEXT DEFAULT '{}',
      refund_reason TEXT,
      refunded_at TEXT,
      refunded_by TEXT,
      refund_gateway_reference TEXT,
      is_test INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
    );
  `);

  // 14. Provider Subscriptions Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS provider_subscriptions (
      id TEXT PRIMARY KEY,
      provider_id TEXT UNIQUE NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'active', 'past_due', 'suspended_unpaid', 'cancelled', 'expired')),
      current_period_start TEXT,
      current_period_end TEXT,
      next_due_date TEXT,
      grace_period_days INTEGER NOT NULL DEFAULT 5,
      grace_period_end TEXT,
      monthly_fee REAL NOT NULL DEFAULT 0,
      fee_version INTEGER NOT NULL DEFAULT 1,
      auto_renew INTEGER NOT NULL DEFAULT 0,
      auto_renew_consent_at TEXT,
      cancelled_at TEXT,
      last_payment_id TEXT,
      overdue_reminder_sent_at TEXT DEFAULT NULL,
      pre_suspension_reminder_sent_at TEXT DEFAULT NULL,
      suspension_notice_sent_at TEXT DEFAULT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (last_payment_id) REFERENCES transactions(id) ON DELETE SET NULL
    );
  `);

  // Migrate provider_subscriptions table if 'suspended_unpaid' is missing from CHECK constraint
  try {
    const subSql = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'provider_subscriptions'").get()?.sql || '';
    if (!subSql.includes('suspended_unpaid')) {
      db.pragma('foreign_keys = OFF');
      db.pragma('legacy_alter_table = ON');
      db.exec(`
        ALTER TABLE provider_subscriptions RENAME TO provider_subscriptions_old_mig;
        CREATE TABLE provider_subscriptions (
          id TEXT PRIMARY KEY,
          provider_id TEXT UNIQUE NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'active', 'past_due', 'suspended_unpaid', 'cancelled', 'expired')),
          current_period_start TEXT,
          current_period_end TEXT,
          next_due_date TEXT,
          grace_period_days INTEGER NOT NULL DEFAULT 5,
          grace_period_end TEXT,
          monthly_fee REAL NOT NULL DEFAULT 0,
          fee_version INTEGER NOT NULL DEFAULT 1,
          auto_renew INTEGER NOT NULL DEFAULT 0,
          auto_renew_consent_at TEXT,
          cancelled_at TEXT,
          last_payment_id TEXT,
          overdue_reminder_sent_at TEXT DEFAULT NULL,
          pre_suspension_reminder_sent_at TEXT DEFAULT NULL,
          suspension_notice_sent_at TEXT DEFAULT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (last_payment_id) REFERENCES transactions(id) ON DELETE SET NULL
        );
        INSERT INTO provider_subscriptions (
          id, provider_id, status, current_period_start, current_period_end,
          next_due_date, grace_period_days, grace_period_end, monthly_fee,
          fee_version, auto_renew, auto_renew_consent_at, cancelled_at,
          last_payment_id, created_at, updated_at
        ) SELECT
          id, provider_id, status, current_period_start, current_period_end,
          next_due_date, 5, grace_period_end, monthly_fee,
          fee_version, auto_renew, auto_renew_consent_at, cancelled_at,
          last_payment_id, created_at, updated_at
        FROM provider_subscriptions_old_mig;
        DROP TABLE provider_subscriptions_old_mig;
      `);
      db.pragma('legacy_alter_table = OFF');
      db.pragma('foreign_keys = ON');
    }
  } catch (err) {
    console.error('provider_subscriptions migration error:', err);
  }

  // Migrations for columns
  try { db.exec("ALTER TABLE bookings ADD COLUMN booking_fee_amount REAL DEFAULT 0;"); } catch (e) {}
  try { db.exec("ALTER TABLE bookings ADD COLUMN booking_fee_status TEXT DEFAULT 'unpaid';"); } catch (e) {}
  try { db.exec("ALTER TABLE bookings ADD COLUMN booking_fee_payment_id TEXT;"); } catch (e) {}
  try { db.exec("ALTER TABLE provider_profiles ADD COLUMN registration_fee_paid INTEGER DEFAULT 0;"); } catch (e) {}
  try { db.exec("ALTER TABLE provider_profiles ADD COLUMN registration_payment_id TEXT;"); } catch (e) {}
  try { db.exec("ALTER TABLE transactions ADD COLUMN billing_period_start TEXT DEFAULT NULL;"); } catch (e) {}
  try { db.exec("ALTER TABLE transactions ADD COLUMN billing_period_end TEXT DEFAULT NULL;"); } catch (e) {}
  try { db.exec("ALTER TABLE provider_subscriptions ADD COLUMN overdue_reminder_sent_at TEXT DEFAULT NULL;"); } catch (e) {}
  try { db.exec("ALTER TABLE provider_subscriptions ADD COLUMN pre_suspension_reminder_sent_at TEXT DEFAULT NULL;"); } catch (e) {}
  try { db.exec("ALTER TABLE provider_subscriptions ADD COLUMN suspension_notice_sent_at TEXT DEFAULT NULL;"); } catch (e) {}

  // Run bookings check constraint migration if awaiting_payment is missing
  try {
    const tableSql = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'bookings'").get()?.sql || '';
    if (!tableSql.includes('awaiting_payment')) {
      db.pragma('foreign_keys = OFF');
      db.pragma('legacy_alter_table = ON');
      db.exec(`
        ALTER TABLE bookings RENAME TO bookings_old_mig;
        CREATE TABLE bookings (
          id TEXT PRIMARY KEY,
          booking_number TEXT UNIQUE NOT NULL,
          customer_id TEXT NOT NULL,
          provider_id TEXT NOT NULL,
          service_category TEXT NOT NULL,
          service_title TEXT NOT NULL,
          task_description TEXT NOT NULL,
          service_location_type TEXT NOT NULL DEFAULT 'in_person' CHECK(service_location_type IN ('in_person', 'online')),
          address TEXT,
          district TEXT,
          city TEXT,
          scheduled_date TEXT NOT NULL,
          scheduled_time_slot TEXT NOT NULL,
          estimated_duration TEXT DEFAULT '2 hours',
          attachments TEXT DEFAULT '[]',
          pricing_type TEXT NOT NULL,
          initial_quote_estimate REAL DEFAULT 0,
          final_amount REAL DEFAULT 0,
          quote_details TEXT DEFAULT NULL,
          status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN (
            'awaiting_payment',
            'pending',
            'awaiting_quote_approval',
            'confirmed',
            'in_progress',
            'awaiting_completion',
            'completed',
            'declined',
            'cancelled'
          )),
          payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK(payment_status IN ('unpaid', 'paid_direct', 'waived', 'refunded')),
          payment_method TEXT DEFAULT 'cash_on_service',
          booking_fee_amount REAL DEFAULT 0,
          booking_fee_status TEXT DEFAULT 'unpaid' CHECK(booking_fee_status IN ('unpaid', 'paid', 'refunded', 'waived')),
          booking_fee_payment_id TEXT,
          platform_commission_rate REAL DEFAULT 0.10,
          platform_commission_amount REAL DEFAULT 0,
          cancellation_reason TEXT DEFAULT NULL,
          cancelled_by TEXT DEFAULT NULL,
          completion_requested_at TEXT DEFAULT NULL,
          completed_at TEXT DEFAULT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE RESTRICT,
          FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE RESTRICT
        );
        INSERT INTO bookings (
          id, booking_number, customer_id, provider_id, service_category, service_title,
          task_description, service_location_type, address, district, city,
          scheduled_date, scheduled_time_slot, estimated_duration, attachments,
          pricing_type, initial_quote_estimate, final_amount, quote_details, status,
          payment_status, payment_method, platform_commission_rate, platform_commission_amount,
          cancellation_reason, cancelled_by, completion_requested_at, completed_at,
          created_at, updated_at
        ) SELECT
          id, booking_number, customer_id, provider_id, service_category, service_title,
          task_description, service_location_type, address, district, city,
          scheduled_date, scheduled_time_slot, estimated_duration, attachments,
          pricing_type, initial_quote_estimate, final_amount, quote_details, status,
          payment_status, payment_method, platform_commission_rate, platform_commission_amount,
          cancellation_reason, cancelled_by, completion_requested_at, completed_at,
          created_at, updated_at
        FROM bookings_old_mig;
        DROP TABLE bookings_old_mig;
      `);
      db.pragma('legacy_alter_table = OFF');
      db.pragma('foreign_keys = ON');
    }
    // Fix any child tables whose FK references were rewritten to bookings_old_mig
    const brokenRefs = db.prepare("SELECT name FROM sqlite_master WHERE sql LIKE '%bookings_old_mig%'").all();
    if (brokenRefs.length > 0) {
      db.pragma('foreign_keys = OFF');
      db.pragma('legacy_alter_table = ON');
      db.exec('ALTER TABLE bookings RENAME TO bookings_old_mig;');
      db.pragma('legacy_alter_table = OFF');
      db.exec('ALTER TABLE bookings_old_mig RENAME TO bookings;');
      db.pragma('foreign_keys = ON');
    }
  } catch (err) {
    console.error('Bookings migration error:', err);
  }

  // Migrate users table to support 'removed' status and account management columns
  try {
    const usersSql = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'users'").get()?.sql || '';
    if (!usersSql.includes("'removed'")) {
      db.pragma('foreign_keys = OFF');
      db.pragma('legacy_alter_table = ON');
      db.exec(`
        ALTER TABLE users RENAME TO users_old_mig;
        CREATE TABLE users (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL CHECK(role IN ('customer', 'provider', 'admin')),
          phone TEXT,
          district TEXT,
          city TEXT,
          address TEXT,
          avatar TEXT,
          status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'suspended', 'removed')),
          created_at TEXT NOT NULL
        );
        INSERT INTO users (id, name, email, password_hash, role, phone, district, city, address, avatar, status, created_at)
        SELECT id, name, email, password_hash, role, phone, district, city, address, avatar, status, created_at FROM users_old_mig;
        DROP TABLE users_old_mig;
      `);
      db.pragma('legacy_alter_table = OFF');
      db.pragma('foreign_keys = ON');
    }
  } catch (err) {
    console.error('Users status migration error:', err);
  }

  const userCols = [
    "token_version INTEGER NOT NULL DEFAULT 1",
    "suspension_reason TEXT DEFAULT NULL",
    "suspended_at TEXT DEFAULT NULL",
    "suspended_by TEXT DEFAULT NULL",
    "suspension_type TEXT DEFAULT NULL",
    "manual_suspended INTEGER NOT NULL DEFAULT 0",
    "manual_suspension_reason TEXT DEFAULT NULL",
    "manual_suspended_at TEXT DEFAULT NULL",
    "manual_suspended_by TEXT DEFAULT NULL",
    "subscription_suspended INTEGER NOT NULL DEFAULT 0",
    "subscription_suspended_at TEXT DEFAULT NULL",
    "removal_reason TEXT DEFAULT NULL",
    "removed_at TEXT DEFAULT NULL",
    "removed_by TEXT DEFAULT NULL",
    "restored_at TEXT DEFAULT NULL",
    "restored_by TEXT DEFAULT NULL",
    "invitation_token TEXT DEFAULT NULL",
    "invitation_expires_at TEXT DEFAULT NULL",
    "invitation_accepted_at TEXT DEFAULT NULL",
    "created_by_admin TEXT DEFAULT NULL"
  ];
  for (const col of userCols) {
    try { db.exec(`ALTER TABLE users ADD COLUMN ${col};`); } catch (e) {}
  }

  // Enforce 5-day grace period in platform_fee_settings
  try {
    db.exec("UPDATE platform_fee_settings SET grace_period_days = 5 WHERE grace_period_days != 5;");
  } catch (e) {}

  // Ensure any pre-existing suspended users without suspension_type are marked as manual suspension
  try {
    db.exec(`
      UPDATE users
      SET suspension_type = 'manual',
          manual_suspended = 1,
          manual_suspension_reason = COALESCE(manual_suspension_reason, suspension_reason),
          manual_suspended_at = COALESCE(manual_suspended_at, suspended_at),
          manual_suspended_by = COALESCE(manual_suspended_by, suspended_by)
      WHERE status = 'suspended' AND suspension_type IS NULL;
    `);
  } catch (e) {}

  // Account Management Audit Logs Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS account_audit_logs (
      id TEXT PRIMARY KEY,
      target_user_id TEXT NOT NULL,
      target_user_name TEXT,
      target_user_email TEXT,
      target_user_role TEXT,
      action TEXT NOT NULL,
      performed_by TEXT NOT NULL,
      performed_by_name TEXT,
      reason TEXT,
      details TEXT DEFAULT '{}',
      created_at TEXT NOT NULL
    );
  `);

  // Ensure category image URLs match local verified photographs
  try {
    const catImages = {
      'electricians': '/images/categories/electricians.jpg',
      'plumbers': '/images/categories/plumbers.jpg',
      'carpenters': '/images/categories/carpenters.jpg',
      'teachers-and-tutors': '/images/categories/teachers-and-tutors.jpg',
      'technicians': '/images/categories/technicians.jpg',
      'appliance-repair': '/images/categories/appliance-repair.jpg',
      'cleaners': '/images/categories/cleaners.jpg',
      'other-services': '/images/categories/other-services.jpg'
    };
    const updateCatImg = db.prepare('UPDATE categories SET image_url = ? WHERE slug = ?');
    for (const [slug, img] of Object.entries(catImages)) {
      updateCatImg.run(img, slug);
    }
  } catch (e) {}

  seedAdminUser(db);
  seedData(db);
  seedFeeSettings(db);
}


function seedAdminUser(db) {
  const adminCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get().count;
  if (adminCount === 0) {
    const passwordHash = bcrypt.hashSync('Admin@Jobzy2026!', 10);
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO users (id, name, email, password_hash, role, phone, district, city, address, avatar, status, created_at)
      VALUES (?, ?, ?, ?, 'admin', ?, 'Colombo', 'Colombo', 'Jobzy HQ, Colombo', 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200', 'active', ?)
    `).run(
      'usr-admin-system',
      'Jobzy Administrator',
      'admin@jobzy.lk',
      passwordHash,
      '+94 11 234 5678',
      now
    );
  }
}


function seedFeeSettings(db) {
  const feeCount = db.prepare('SELECT COUNT(*) as count FROM platform_fee_settings').get().count;
  if (feeCount > 0) return;

  const now = new Date().toISOString();
  const insertFee = db.prepare(`
    INSERT INTO platform_fee_settings (
      id, fee_type, title, description, amount, currency, is_enabled,
      effective_date, version, grace_period_days, transition_date, gateway_mode,
      payhere_merchant_id, payhere_merchant_secret, updated_by, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // 1. Provider Registration Fee
  insertFee.run(
    'fee-provider-registration',
    'provider_registration',
    'Provider Registration Fee',
    'One-time platform onboarding and verification fee for new service providers',
    2500,
    'LKR',
    1,
    '2026-01-01',
    1,
    5,
    null,
    'test',
    '',
    '',
    'usr-admin-system',
    now
  );

  // 2. Provider Monthly Subscription
  insertFee.run(
    'fee-provider-subscription',
    'provider_subscription',
    'Provider Monthly Subscription',
    'Monthly directory listing and website usage fee paid by each service provider',
    1500,
    'LKR',
    1,
    '2026-01-01',
    1,
    5,
    null,
    'test',
    '',
    '',
    'usr-admin-system',
    now
  );

  // 3. Customer Booking Fee
  insertFee.run(
    'fee-customer-booking',
    'customer_booking',
    'Customer Booking Fee',
    'Platform booking coordination and service protection fee per request',
    350,
    'LKR',
    1,
    '2026-01-01',
    1,
    5,
    null,
    'test',
    '',
    '',
    'usr-admin-system',
    now
  );

  // Seed initial audit trail in fee_change_history
  const insertHistory = db.prepare(`
    INSERT INTO fee_change_history (
      id, fee_type, previous_amount, new_amount, currency, effective_date,
      version, changed_by, reason, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertHistory.run('fch-1', 'provider_registration', 0, 2500, 'LKR', '2026-01-01', 1, 'usr-admin-system', 'Initial platform fee configuration', now);
  insertHistory.run('fch-2', 'provider_subscription', 0, 1500, 'LKR', '2026-01-01', 1, 'usr-admin-system', 'Initial platform fee configuration', now);
  insertHistory.run('fch-3', 'customer_booking', 0, 350, 'LKR', '2026-01-01', 1, 'usr-admin-system', 'Initial platform fee configuration', now);
}

function seedData(db) {
  const catCount = db.prepare('SELECT COUNT(*) as count FROM categories').get().count;
  if (catCount > 0) return;

  const now = new Date().toISOString();

  // Platform Settings
  const insertSetting = db.prepare(`
    INSERT INTO platform_settings (key, value, description, updated_at)
    VALUES (?, ?, ?, ?)
  `);
  insertSetting.run('platform_commission_rate', '0.10', 'Platform commission rate (10%) on completed bookings', now);
  insertSetting.run('provider_registration_fee', '2500', 'One-time registration fee for verified providers (LKR)', now);
  insertSetting.run('sponsored_listing_fee_monthly', '4500', 'Monthly fee for featured provider spotlight badge (LKR)', now);
  insertSetting.run('cancellation_cutoff_hours', '12', 'Free cancellation allowed up to 12 hours before scheduled slot', now);
  insertSetting.run('support_phone', '+94 11 234 5678', 'Official Jobzy Sri Lanka Customer Helpdesk', now);
  insertSetting.run('support_email', 'support@jobzy.lk', 'Support inquiries email', now);

  // Categories
  const insertCat = db.prepare(`
    INSERT INTO categories (id, name, slug, icon, description, image_url, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const categories = [
    { id: 'cat-electrician', name: 'Electrical', slug: 'electricians', icon: 'Zap', description: 'Certified domestic wiring, solar inverters, fault detection, and circuit repairs.', image_url: '/images/categories/electricians.jpg', sort_order: 1 },
    { id: 'cat-plumber', name: 'Plumbing', slug: 'plumbers', icon: 'Droplet', description: 'Pipe fittings, water leak repairs, pressure pumps, bathroom & sink installations.', image_url: '/images/categories/plumbers.jpg', sort_order: 2 },
    { id: 'cat-carpenter', name: 'Carpentry', slug: 'carpenters', icon: 'Hammer', description: 'Teak pantry cupboards, custom doors, roof trusses, and fine wood craftsmanship.', image_url: '/images/categories/carpenters.jpg', sort_order: 3 },
    { id: 'cat-tutor', name: 'Teaching and Tuition', slug: 'teachers-and-tutors', icon: 'GraduationCap', description: 'O/L, A/L & Cambridge Mathematics, Science, English, and IT tutoring.', image_url: '/images/categories/teachers-and-tutors.jpg', sort_order: 4 },
    { id: 'cat-technician', name: 'Technical Support', slug: 'technicians', icon: 'Cpu', description: 'CCTV setup, Wi-Fi networking, computer hardware troubleshooting, and solar maintenance.', image_url: '/images/categories/technicians.jpg', sort_order: 5 },
    { id: 'cat-appliance', name: 'Appliance Repair', slug: 'appliance-repair', icon: 'Wrench', description: 'Inverter AC maintenance, washing machines, refrigerators, and microwave repairs.', image_url: '/images/categories/appliance-repair.jpg', sort_order: 6 },
    { id: 'cat-cleaner', name: 'Cleaning', slug: 'cleaners', icon: 'Sparkles', description: 'Post-construction cleanup, upholstery shampooing, deep home & office sanitization.', image_url: '/images/categories/cleaners.jpg', sort_order: 7 },
    { id: 'cat-other', name: 'Other Services', slug: 'other-services', icon: 'Wrench', description: 'Masonry, painting, gardening, and handyman services.', image_url: '/images/categories/other-services.jpg', sort_order: 8 }
  ];

  for (const c of categories) {
    insertCat.run(c.id, c.name, c.slug, c.icon, c.description, c.image_url, c.sort_order);
  }
}


export function updateProviderRating(providerId) {
  const db = getDb();
  const stats = db.prepare(`
    SELECT COUNT(*) as count, AVG(rating) as avg_rating
    FROM reviews
    WHERE provider_id = ? AND is_hidden = 0
  `).get(providerId);

  const reviewCount = stats.count || 0;
  const ratingAvg = stats.avg_rating ? Math.round(stats.avg_rating * 10) / 10 : 0;

  db.prepare(`
    UPDATE provider_profiles
    SET rating_avg = ?, review_count = ?
    WHERE id = ?
  `).run(ratingAvg, reviewCount, providerId);
}

export function createNotification(userId, type, title, message, link = null) {
  const db = getDb();
  const notifId = 'notif-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
  db.prepare(`
    INSERT INTO notifications (id, user_id, type, title, message, link, is_read, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?)
  `).run(notifId, userId, type, title, message, link, new Date().toISOString());
}

export function generateConfirmationId(db) {
  const year = new Date().getFullYear();
  const prefix = `JZ-SP-${year}-`;
  const row = db.prepare('SELECT confirmation_id FROM provider_profiles WHERE confirmation_id LIKE ? ORDER BY confirmation_id DESC LIMIT 1').get(`${prefix}%`);
  let nextSeq = 1;
  if (row && row.confirmation_id) {
    const parts = row.confirmation_id.split('-');
    const num = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(num)) nextSeq = num + 1;
  }
  return `${prefix}${String(nextSeq).padStart(6, '0')}`;
}

export function generateBookingNumber() {
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `JBZ-${rand}`;
}


export function logAccountAction({
  targetUserId,
  targetUserName,
  targetUserEmail,
  targetUserRole,
  action,
  performedBy,
  performedByName,
  reason = null,
  details = {}
}) {
  const db = getDb();
  const id = `aud-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  db.prepare(`
    INSERT INTO account_audit_logs (
      id, target_user_id, target_user_name, target_user_email, target_user_role,
      action, performed_by, performed_by_name, reason, details, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    targetUserId,
    targetUserName || '',
    targetUserEmail || '',
    targetUserRole || '',
    action,
    performedBy,
    performedByName || 'Administrator',
    reason,
    JSON.stringify(details || {}),
    new Date().toISOString()
  );
  return id;
}

export { supabase, supabaseAdmin, querySupabase };
export default getDb;
