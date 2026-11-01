import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const MIME_BY_EXT = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp'
};

export async function GET(request, { params }) {
  const { filename } = await params;

  // Sanitize filename to prevent path traversal
  const safeName = path.basename(filename || '');
  if (!safeName || safeName !== filename) {
    return NextResponse.json({ error: 'Invalid filename.' }, { status: 400 });
  }

  const ext = path.extname(safeName).toLowerCase();
  const contentType = MIME_BY_EXT[ext];
  if (!contentType) {
    return NextResponse.json({ error: 'Unsupported image format.' }, { status: 400 });
  }

  const filePath = path.join(process.cwd(), 'public', 'uploads', 'avatars', safeName);
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: 'Avatar not found.' }, { status: 404 });
  }

  const fileBuffer = fs.readFileSync(filePath);
  return new NextResponse(fileBuffer, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable'
    }
  });
}

