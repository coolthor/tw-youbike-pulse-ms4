import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
const SOURCE = 'https://tcgbusfs.blob.core.windows.net/dotapp/youbike/v2/youbike_immediate.json';

type RawStation = {
  sno: string; sna: string; sarea: string; mday: string; ar: string; act: string;
  updateTime: string; infoTime: string; Quantity: number; available_rent_bikes: number;
  available_return_bikes: number; latitude: number; longitude: number;
};

function statusOf(s: RawStation) {
  if (s.act !== '1') return { level: 'bad', label: '暫停營運', score: 100 };
  if (s.available_rent_bikes === 0) return { level: 'bad', label: '無車可借', score: 95 };
  if (s.available_return_bikes === 0) return { level: 'bad', label: '無位可還', score: 90 };
  const rentRatio = s.Quantity ? s.available_rent_bikes / s.Quantity : 0;
  const returnRatio = s.Quantity ? s.available_return_bikes / s.Quantity : 0;
  if (rentRatio < 0.15) return { level: 'warn', label: '車輛偏少', score: 70 };
  if (returnRatio < 0.15) return { level: 'warn', label: '空位偏少', score: 65 };
  return { level: 'ok', label: '供需正常', score: 20 };
}

export async function GET() {
  const res = await fetch(SOURCE, { next: { revalidate: 60 } });
  if (!res.ok) return NextResponse.json({ error: 'source_failed', status: res.status }, { status: 502 });
  const raw = (await res.json()) as RawStation[];
  const stations = raw.map((s) => ({
    id: s.sno,
    name: s.sna.replace('YouBike2.0_', ''),
    area: s.sarea,
    address: s.ar,
    total: Number(s.Quantity || 0),
    bikes: Number(s.available_rent_bikes || 0),
    docks: Number(s.available_return_bikes || 0),
    updatedAt: s.updateTime || s.mday,
    lat: Number(s.latitude),
    lng: Number(s.longitude),
    ...statusOf(s),
  })).sort((a,b)=>b.score-a.score || a.area.localeCompare(b.area, 'zh-Hant'));
  const problem = stations.filter(s=>s.level !== 'ok');
  return NextResponse.json({
    source: SOURCE,
    fetchedAt: new Date().toISOString(),
    count: stations.length,
    summary: {
      problem: problem.length,
      noBike: stations.filter(s=>s.label==='無車可借').length,
      noDock: stations.filter(s=>s.label==='無位可還').length,
      ok: stations.filter(s=>s.level==='ok').length,
    },
    stations,
  });
}
