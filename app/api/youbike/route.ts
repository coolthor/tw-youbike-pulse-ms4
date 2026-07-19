import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const TAIPEI_SOURCE = 'https://tcgbusfs.blob.core.windows.net/dotapp/youbike/v2/youbike_immediate.json';
const ALL_YOUBIKE_SOURCE = 'https://apis.youbike.com.tw/json/station-yb2.json';

type Station = {
  id: string;
  name: string;
  area: string;
  address: string;
  total: number;
  bikes: number;
  docks: number;
  updatedAt: string;
  lat: number;
  lng: number;
  level: 'ok' | 'warn' | 'bad';
  label: string;
  score: number;
  eBikes?: number;
};

type TaipeiRaw = {
  sno: string; sna: string; sarea: string; mday: string; ar: string; act: string;
  updateTime: string; Quantity: number; available_rent_bikes: number;
  available_return_bikes: number; latitude: number; longitude: number;
};

type OfficialStation = {
  country_code: string; area_code: string; type: number; status: number; station_no: string;
  name_tw: string; district_tw: string; address_tw: string; parking_spaces: number;
  available_spaces: number; available_spaces_detail?: { yb1?: number; yb2?: number; eyb?: number };
  empty_spaces: number; lat: string; lng: string; updated_at: string; time: string;
};

function tainanArea(address: string) {
  const m = address.match(/([\u4e00-\u9fff]{2,4}區)/);
  return m?.[1] ?? '台南市';
}

function statusOf(total: number, bikes: number, docks: number, active = true) {
  if (!active) return { level: 'bad' as const, label: '暫停服務', score: 100 };
  if (bikes === 0) return { level: 'bad' as const, label: '現在沒車', score: 95 };
  if (docks === 0) return { level: 'bad' as const, label: '目前滿站', score: 90 };
  const rentRatio = total ? bikes / total : 0;
  const returnRatio = total ? docks / total : 0;
  if (rentRatio < 0.15) return { level: 'warn' as const, label: '快沒車', score: 70 };
  if (returnRatio < 0.15) return { level: 'warn' as const, label: '快滿站', score: 65 };
  return { level: 'ok' as const, label: '供需穩定', score: 20 };
}

function summarize(stations: Station[]) {
  return {
    problem: stations.filter((s) => s.level !== 'ok').length,
    noBike: stations.filter((s) => s.label === '現在沒車').length,
    noDock: stations.filter((s) => s.label === '目前滿站').length,
    ok: stations.filter((s) => s.level === 'ok').length,
    eBikes: stations.reduce((sum, s) => sum + (s.eBikes ?? 0), 0),
  };
}

async function getTaipei() {
  const res = await fetch(TAIPEI_SOURCE, { next: { revalidate: 60 } });
  if (!res.ok) throw new Error(`taipei_source_${res.status}`);
  const raw = (await res.json()) as TaipeiRaw[];
  const stations = raw.map((s) => {
    const total = Number(s.Quantity || 0);
    const bikes = Number(s.available_rent_bikes || 0);
    const docks = Number(s.available_return_bikes || 0);
    return {
      id: s.sno,
      name: s.sna.replace('YouBike2.0_', ''),
      area: s.sarea,
      address: s.ar,
      total,
      bikes,
      docks,
      updatedAt: s.updateTime || s.mday,
      lat: Number(s.latitude),
      lng: Number(s.longitude),
      ...statusOf(total, bikes, docks, s.act === '1'),
    } satisfies Station;
  });
  return { city: 'taipei', cityName: '台北', source: TAIPEI_SOURCE, stations };
}

async function getTainan() {
  const res = await fetch(ALL_YOUBIKE_SOURCE, { next: { revalidate: 60 } });
  if (!res.ok) throw new Error(`youbike_all_${res.status}`);
  const raw = (await res.json()) as OfficialStation[];
  const rows = raw.filter((s) => s.country_code === '00' && s.area_code === '13');
  const stations = rows.map((s) => {
    const total = Number(s.parking_spaces || 0);
    const bikes = Number(s.available_spaces || 0);
    const docks = Number(s.empty_spaces || 0);
    return {
      id: s.station_no,
      name: s.name_tw,
      area: s.district_tw || tainanArea(s.address_tw),
      address: s.address_tw,
      total,
      bikes,
      docks,
      updatedAt: s.updated_at || s.time,
      lat: Number(s.lat),
      lng: Number(s.lng),
      eBikes: Number(s.available_spaces_detail?.eyb || 0),
      ...statusOf(total, bikes, docks, s.status === 1),
    } satisfies Station;
  });
  return { city: 'tainan', cityName: '台南', source: `${ALL_YOUBIKE_SOURCE} (area_code=13)`, stations };
}


export async function GET(req: NextRequest) {
  try {
    const city = req.nextUrl.searchParams.get('city')?.toLowerCase() === 'tainan' ? 'tainan' : 'taipei';
    const payload = city === 'tainan' ? await getTainan() : await getTaipei();
    const stations = payload.stations.sort((a, b) => b.score - a.score || a.area.localeCompare(b.area, 'zh-Hant'));
    return NextResponse.json({
      ...payload,
      fetchedAt: new Date().toISOString(),
      count: stations.length,
      summary: summarize(stations),
      stations,
    });
  } catch (error) {
    return NextResponse.json({ error: 'source_failed', detail: String(error) }, { status: 502 });
  }
}
