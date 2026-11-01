import { NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { isProviderPubliclyActive, evaluateProviderSubscriptions } from '@/lib/paymentService';

export async function GET(request) {
  try {
    evaluateProviderSubscriptions();
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const district = searchParams.get('district');
    const town = searchParams.get('town');
    const rating = searchParams.get('rating');
    const pricingType = searchParams.get('pricingType');
    const sort = searchParams.get('sort') || 'relevance';
    const search = searchParams.get('search');

    const db = getDb();
    let query = `
      SELECT 
        u.id, u.name, u.avatar, u.district, u.city,
        p.title, p.bio, p.experience_years, p.pricing_type, p.base_rate,
        p.pricing_description, p.service_districts, p.service_towns, p.skills,
        p.verification_status, p.is_sponsored, p.sponsored_label,
        p.rating_avg, p.review_count, p.availability,
        c.id as category_id, c.name as category_name, c.slug as category_slug
      FROM provider_profiles p
      JOIN users u ON p.id = u.id
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE u.status = 'active' AND p.verification_status = 'approved'
    `;

    const params = [];

    if (category && category !== 'all') {
      query += ` AND (c.slug = ? OR c.id = ?)`;
      params.push(category, category);
    }

    if (district && district !== 'all') {
      query += ` AND (u.district = ? OR p.service_districts LIKE ?)`;
      params.push(district, `%"${district}"%`);
    }

    if (town && town.trim()) {
      query += ` AND (u.city LIKE ? OR p.service_towns LIKE ?)`;
      params.push(`%${town.trim()}%`, `%${town.trim()}%`);
    }

    if (rating && parseFloat(rating) > 0) {
      query += ` AND p.rating_avg >= ?`;
      params.push(parseFloat(rating));
    }

    if (pricingType && ['hourly', 'fixed', 'quote'].includes(pricingType)) {
      query += ` AND p.pricing_type = ?`;
      params.push(pricingType);
    }

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      query += ` AND (u.name LIKE ? OR p.title LIKE ? OR p.bio LIKE ? OR p.skills LIKE ?)`;
      params.push(term, term, term, term);
    }

    if (sort === 'rating') {
      query += ` ORDER BY p.rating_avg DESC, p.review_count DESC`;
    } else if (sort === 'price_low') {
      query += ` ORDER BY CASE WHEN p.pricing_type = 'quote' THEN 999999 ELSE p.base_rate END ASC`;
    } else if (sort === 'price_high') {
      query += ` ORDER BY p.base_rate DESC`;
    } else {
      query += ` ORDER BY p.is_sponsored DESC, (p.verification_status = 'approved') DESC, p.rating_avg DESC, p.review_count DESC`;
    }

    const providers = db.prepare(query).all(...params);

    const activeProviders = providers.filter(p => isProviderPubliclyActive(p.id));
    const formatted = activeProviders.map(p => ({
      ...p,
      service_districts: JSON.parse(p.service_districts || '[]'),
      skills: JSON.parse(p.skills || '[]'),
      availability: JSON.parse(p.availability || '{}')
    }));

    return NextResponse.json(formatted);
  } catch (error) {
    console.error('Error fetching providers:', error);
    return NextResponse.json({ error: 'Failed to retrieve providers.' }, { status: 500 });
  }
}
