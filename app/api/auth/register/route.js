import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import getDb, { createNotification, generateConfirmationId } from '@/lib/db';
import { generateToken } from '@/lib/auth';
import { getFeeSetting } from '@/lib/paymentService';

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      name,
      email,
      password,
      role = 'customer',
      phone,
      district,
      city,
      address,
      categoryId,
      title,
      bio,
      experienceYears,
      pricingType,
      baseRate,
      pricingDescription,
      serviceDistricts,
      serviceTowns,
      skills,
      qualifications,
      verificationDocs
    } = body;

    if (!name || !email || !password) {
      return NextResponse.json({ error: 'Name, email, and password are required.' }, { status: 400 });
    }

    if (!['customer', 'provider'].includes(role)) {
      return NextResponse.json({ error: 'Role must be customer or provider.' }, { status: 400 });
    }

    const db = getDb();

    // Server-side validation for provider category
    const selectedCategoryId = (categoryId || body.category_id || '').toString().trim();
    if (role === 'provider') {
      if (!selectedCategoryId) {
        return NextResponse.json({ error: 'Please select a valid service category.' }, { status: 400 });
      }
      const categoryRecord = db.prepare('SELECT id, name, is_active FROM categories WHERE id = ?').get(selectedCategoryId);
      if (!categoryRecord || !categoryRecord.is_active) {
        return NextResponse.json({ error: 'The selected service category is invalid or inactive.' }, { status: 400 });
      }
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
    if (existing) {
      return NextResponse.json({ error: 'An account with this email address already exists.' }, { status: 409 });
    }

    const userId = 'usr-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    const passwordHash = bcrypt.hashSync(password, 10);
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO users (id, name, email, password_hash, role, phone, district, city, address, avatar, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
    `).run(
      userId,
      name.trim(),
      email.toLowerCase().trim(),
      passwordHash,
      role,
      phone || null,
      district || 'Colombo',
      city || 'Colombo',
      address || null,
      role === 'provider'
        ? 'https://images.unsplash.com/photo-1544717305-2782549b5136?w=200'
        : 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200',
      now
    );

    let confirmationId = null;

    if (role === 'provider') {
      // Ensure unique confirmation ID generation
      let attempts = 0;
      while (!confirmationId && attempts < 5) {
        try {
          const candidateId = generateConfirmationId(db);
          db.prepare(`
            INSERT INTO provider_profiles (
              id,
              confirmation_id,
              category_id,
              title,
              bio,
              experience_years,
              pricing_type,
              base_rate,
              pricing_description,
              service_districts,
              service_towns,
              skills,
              qualifications,
              portfolio_images,
              verification_status,
              verification_documents,
              verification_notes,
              is_sponsored,
              rating_avg,
              review_count,
              availability
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?)
          `).run(
            userId,
            candidateId,
            selectedCategoryId,
            title || 'Skilled Professional Service Provider',
            bio || 'Experienced trade professional in Sri Lanka dedicated to quality service.',
            parseInt(experienceYears ?? body.experience_years, 10) || 1,
            pricingType || body.pricing_type || 'hourly',
            parseFloat(baseRate ?? body.base_rate) || 1500,
            pricingDescription || 'Standard transparent rates.',
            JSON.stringify(Array.isArray(serviceDistricts) ? serviceDistricts : [district || 'Colombo']),
            serviceTowns || city || '',
            JSON.stringify(Array.isArray(skills) ? skills : ['General Maintenance']),
            JSON.stringify(Array.isArray(qualifications) ? qualifications : ['Technical Qualification']),
            JSON.stringify([]),
            'pending',
            JSON.stringify(verificationDocs || [{ type: 'National Identity Card (NIC)', number: 'Pending upload', verified: false, date: now }]),
            'Awaiting Registration Payment. Application will enter Pending Admin Approval once the registration fee is verified.',
            JSON.stringify({
              monday: '08:00 - 18:00',
              tuesday: '08:00 - 18:00',
              wednesday: '08:00 - 18:00',
              thursday: '08:00 - 18:00',
              friday: '08:00 - 18:00',
              saturday: '09:00 - 16:00',
              sunday: 'Closed'
            })
          );
          confirmationId = candidateId;
        } catch (err) {
          attempts++;
          if (attempts >= 5) throw err;
        }
      }

      // Notify admins about new provider registration (awaiting registration payment)
      const admins = db.prepare("SELECT id FROM users WHERE role = 'admin'").all();
      for (const admin of admins) {
        createNotification(
          admin.id,
          'registration',
          'New Service Provider Registration (Awaiting Payment)',
          `Provider ${name} registered (Confirmation ID: ${confirmationId}) on ${new Date(now).toLocaleString('en-US')}. Status: Awaiting Registration Payment.`,
          '/admin/dashboard'
        );
      }
    } else {
      // Notify admins about new customer registration
      const admins = db.prepare("SELECT id FROM users WHERE role = 'admin'").all();
      for (const admin of admins) {
        createNotification(
          admin.id,
          'registration',
          'New Customer Registration',
          `Customer ${name} registered with email ${email} on ${new Date(now).toLocaleString('en-US')}.`,
          '/admin/dashboard'
        );
      }
    }

    const newUser = db.prepare('SELECT id, name, email, role, phone, district, city, address, avatar, status FROM users WHERE id = ?').get(userId);
    if (role === 'provider') {
      const profile = db.prepare(`
        SELECT p.*, c.name as category_name
        FROM provider_profiles p
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE p.id = ?
      `).get(userId);
      if (profile) {
        newUser.providerProfile = {
          ...profile,
          registration_status_label: profile.registration_fee_paid ? 'Pending Admin Approval' : 'Awaiting Registration Payment'
        };
      }
    }
    const token = generateToken(newUser);
    const regFeeSetting = role === 'provider' ? getFeeSetting('provider_registration') : null;

    return NextResponse.json({
      message: role === 'provider'
        ? `Your registration ID is ${confirmationId}. Your status is Awaiting Registration Payment.`
        : 'Account created successfully.',
      token,
      user: newUser,
      confirmation_id: confirmationId,
      registration_fee_amount: regFeeSetting?.amount || 0,
      application_status: role === 'provider' ? 'Awaiting Registration Payment' : 'active'
    }, { status: 201 });
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json({ error: 'Server error during registration.' }, { status: 500 });
  }
}
