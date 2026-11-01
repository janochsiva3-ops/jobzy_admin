import { NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { verifyAuth, requireRole } from '@/lib/auth';
import { isProviderPubliclyActive, evaluateProviderSubscriptions } from '@/lib/paymentService';

export async function GET(request, { params }) {
  const { id } = await params;
  evaluateProviderSubscriptions();
  const db = getDb();
  const auth = verifyAuth(request);
  const isOwnerOrAdmin = auth.user && (auth.user.role === 'admin' || auth.user.id === id);

  if (!isOwnerOrAdmin && !isProviderPubliclyActive(id)) {
    return NextResponse.json({ error: 'Provider profile is not currently available for public viewing or bookings.' }, { status: 404 });
  }

  const provider = db.prepare(`
    SELECT 
      u.id, u.name, u.email, u.phone, u.avatar, u.district, u.city, u.address, u.status as user_status,
      p.title, p.bio, p.experience_years, p.pricing_type, p.base_rate,
      p.pricing_description, p.service_districts, p.service_towns, p.skills,
      p.qualifications, p.portfolio_images, p.verification_status, p.is_sponsored,
      p.sponsored_label, p.rating_avg, p.review_count, p.availability, p.verified_at,
      c.id as category_id, c.name as category_name, c.slug as category_slug
    FROM provider_profiles p
    JOIN users u ON p.id = u.id
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.id = ? AND u.status != 'removed'
  `).get(id);

  if (!provider) {
    return NextResponse.json({ error: 'Provider profile not found.' }, { status: 404 });
  }

  const reviews = db.prepare(`
    SELECT 
      r.id, r.rating, r.review_text, r.response_text, r.created_at,
      u.name as customer_name, u.avatar as customer_avatar, u.city as customer_city,
      b.service_title, b.scheduled_date
    FROM reviews r
    JOIN users u ON r.customer_id = u.id
    JOIN bookings b ON r.booking_id = b.id
    WHERE r.provider_id = ? AND r.is_hidden = 0
    ORDER BY r.created_at DESC
  `).all(id);

  return NextResponse.json({
    ...provider,
    service_districts: JSON.parse(provider.service_districts || '[]'),
    skills: JSON.parse(provider.skills || '[]'),
    qualifications: JSON.parse(provider.qualifications || '[]'),
    portfolio_images: JSON.parse(provider.portfolio_images || '[]'),
    availability: JSON.parse(provider.availability || '{}'),
    reviews
  });
}

export async function PUT(request, { params }) {
  const { id } = await params;
  const auth = requireRole(request, 'provider', 'admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  // Ensure provider is editing their own profile or is admin
  if (auth.user.role !== 'admin' && auth.user.id !== id) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const {
      title,
      bio,
      categoryId,
      experienceYears,
      pricingType,
      baseRate,
      pricingDescription,
      serviceDistricts,
      serviceTowns,
      skills,
      qualifications,
      portfolioImages,
      availability
    } = body;

    const db = getDb();
    db.prepare(`
      UPDATE provider_profiles
      SET title = COALESCE(?, title),
          bio = COALESCE(?, bio),
          category_id = COALESCE(?, category_id),
          experience_years = COALESCE(?, experience_years),
          pricing_type = COALESCE(?, pricing_type),
          base_rate = COALESCE(?, base_rate),
          pricing_description = COALESCE(?, pricing_description),
          service_districts = COALESCE(?, service_districts),
          service_towns = COALESCE(?, service_towns),
          skills = COALESCE(?, skills),
          qualifications = COALESCE(?, qualifications),
          portfolio_images = COALESCE(?, portfolio_images),
          availability = COALESCE(?, availability)
      WHERE id = ?
    `).run(
      title,
      bio,
      categoryId,
      experienceYears ? parseInt(experienceYears, 10) : null,
      pricingType,
      baseRate !== undefined ? parseFloat(baseRate) : null,
      pricingDescription,
      serviceDistricts ? JSON.stringify(serviceDistricts) : null,
      serviceTowns,
      skills ? JSON.stringify(skills) : null,
      qualifications ? JSON.stringify(qualifications) : null,
      portfolioImages ? JSON.stringify(portfolioImages) : null,
      availability ? JSON.stringify(availability) : null,
      id
    );

    return NextResponse.json({ message: 'Provider profile updated successfully.' });
  } catch (err) {
    console.error('Error updating provider profile:', err);
    return NextResponse.json({ error: 'Could not update profile.' }, { status: 500 });
  }
}
