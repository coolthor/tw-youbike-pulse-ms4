import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const key = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    return NextResponse.json({ enabled: false, reason: 'missing_google_places_key', places: [] });
  }
  const q = req.nextUrl.searchParams.get('q') || '台南景點';
  const url = 'https://places.googleapis.com/v1/places:searchText';
  const body = JSON.stringify({ textQuery: q, languageCode: 'zh-TW', regionCode: 'TW', maxResultCount: 6 });
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.googleMapsUri'
    },
    body,
    next: { revalidate: 3600 }
  });
  if (!res.ok) return NextResponse.json({ enabled: true, error: `google_${res.status}`, places: [] }, { status: 502 });
  const data = await res.json();
  return NextResponse.json({ enabled: true, places: data.places || [] });
}
