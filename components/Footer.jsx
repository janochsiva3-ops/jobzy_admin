'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Wrench, Phone, Mail, MapPin, ShieldCheck, ChevronDown } from 'lucide-react';

export default function Footer() {
  const pathname = usePathname();
  const [activeSection, setActiveSection] = useState(null);

  // Hide public footer on private admin routes
  if (pathname?.startsWith('/admin')) {
    return null;
  }

  const toggleSection = (id) => {
    setActiveSection((prev) => (prev === id ? null : id));
  };

  const sections = [
    { id: 'about', title: 'About Jobzy' },
    { id: 'links', title: 'Quick Links' },
    { id: 'accounts', title: 'Account Access' },
    { id: 'policies', title: 'Help & Policies' }
  ];

  const renderSectionContent = (id) => {
    switch (id) {
      case 'about':
        return (
          <div className="footer-panel-about-grid">
            <div>
              <p style={{ fontSize: '0.9rem', color: '#334155', lineHeight: 1.55, margin: 0 }}>
                Sri Lanka’s service marketplace connecting customers with verified electricians, plumbers, carpenters, tutors, technicians and skilled specialists.
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              <div className="footer-contact-item">
                <Phone size={14} color="#1D4ED8" style={{ flexShrink: 0 }} />
                <a href="tel:+94704413635">+94 70 441 3635</a>
              </div>
              <div className="footer-contact-item">
                <Mail size={14} color="#1D4ED8" style={{ flexShrink: 0 }} />
                <a href="mailto:support@jobzy.lk">support@jobzy.lk</a>
              </div>
              <div className="footer-contact-item">
                <MapPin size={14} color="#1D4ED8" style={{ flexShrink: 0 }} />
                <span>Colombo & Island-wide, Sri Lanka</span>
              </div>
            </div>
          </div>
        );

      case 'links':
        return (
          <div className="footer-panel-links-row">
            <Link href="/about" className="footer-link-item">About</Link>
            <Link href="/#categories" className="footer-link-item">Services</Link>
            <Link href="/find" className="footer-link-item">Find Professionals</Link>
            <Link href="/contact" className="footer-link-item">Contact</Link>
          </div>
        );

      case 'accounts':
        return (
          <div>
            <div className="footer-panel-links-row" style={{ marginBottom: '0.75rem' }}>
              <Link href="/customer/login" className="footer-link-item">Customer Login</Link>
              <Link href="/provider/login" className="footer-link-item">Service Provider Login</Link>
              <Link href="/provider/register" className="footer-link-item" style={{ fontWeight: 600, color: '#1D4ED8' }}>
                Become a Service Provider
              </Link>
            </div>
            <div className="footer-note-box">
              <ShieldCheck size={16} color="#1D4ED8" style={{ flexShrink: 0 }} />
              <span>
                <strong>Vetted Providers:</strong> Provider credentials undergo administrator inspection before verified approval.
              </span>
            </div>
          </div>
        );

      case 'policies':
        return (
          <div className="footer-panel-links-row">
            <Link href="/faq" className="footer-link-item">Help</Link>
            <Link href="/privacy" className="footer-link-item">Privacy Policy</Link>
            <Link href="/terms" className="footer-link-item">Terms</Link>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <footer className="footer" id="site-footer">
      <div className="container">
        {/* Top Bar with Small Logo & Horizontal Expandable Headings (Desktop) */}
        <div className="footer-top-row">
          {/* Small Jobzy Logo */}
          <Link href="/" className="footer-brand-small" id="footer-logo">
            <div className="footer-brand-badge">
              <Wrench size={13} />
            </div>
            <span>Job<span style={{ color: '#FF7A00' }}>Z</span>y</span>
          </Link>

          {/* Desktop Horizontal Headings */}
          <nav className="footer-nav-desktop" aria-label="Footer Navigation">
            {sections.map((sec) => {
              const isOpen = activeSection === sec.id;
              return (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => toggleSection(sec.id)}
                  className={`footer-heading-btn ${isOpen ? 'active' : ''}`}
                  aria-expanded={isOpen}
                  aria-controls={`footer-desktop-panel-${sec.id}`}
                  id={`footer-desktop-btn-${sec.id}`}
                >
                  <span>{sec.title}</span>
                  <ChevronDown
                    size={14}
                    className={`footer-chevron ${isOpen ? 'open' : ''}`}
                    aria-hidden="true"
                  />
                </button>
              );
            })}
          </nav>
        </div>

        {/* Desktop Expanded Details Panel (expands directly underneath) */}
        {activeSection && (
          <div
            id={`footer-desktop-panel-${activeSection}`}
            className="footer-desktop-expanded-panel"
            role="region"
            aria-labelledby={`footer-desktop-btn-${activeSection}`}
          >
            {renderSectionContent(activeSection)}
          </div>
        )}

        {/* Mobile Accordion Rows (stacked on mobile) */}
        <div className="footer-mobile-accordion" aria-label="Mobile Footer Sections">
          {sections.map((sec) => {
            const isOpen = activeSection === sec.id;
            return (
              <div key={sec.id} className="footer-mobile-item">
                <button
                  type="button"
                  onClick={() => toggleSection(sec.id)}
                  className={`footer-heading-btn footer-mobile-btn ${isOpen ? 'active' : ''}`}
                  aria-expanded={isOpen}
                  aria-controls={`footer-mobile-panel-${sec.id}`}
                  id={`footer-mobile-btn-${sec.id}`}
                >
                  <span>{sec.title}</span>
                  <ChevronDown
                    size={14}
                    className={`footer-chevron ${isOpen ? 'open' : ''}`}
                    aria-hidden="true"
                  />
                </button>

                {isOpen && (
                  <div
                    id={`footer-mobile-panel-${sec.id}`}
                    className="footer-mobile-panel-body"
                    role="region"
                    aria-labelledby={`footer-mobile-btn-${sec.id}`}
                  >
                    {renderSectionContent(sec.id)}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Compact Copyright Line (duplicate policy links removed) */}
        <div className="footer-bottom-compact">
          <span>&copy; {new Date().getFullYear()} Jobzy Sri Lanka. All rights reserved.</span>
          <span style={{ color: '#94A3B8' }}>Verified Skills Marketplace</span>
        </div>
      </div>
    </footer>
  );
}
