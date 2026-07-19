import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const TAIPEI_SOURCE = 'https://tcgbusfs.blob.core.windows.net/dotapp/youbike/v2/youbike_immediate.json';
const TAINAN_STATIONS = 'https://tdx.transportdata.tw/api/basic/v2/Bike/Station/City/Tainan?%24format=JSON';
const TAINAN_AVAILABILITY = 'https://tdx.transportdata.tw/api/basic/v2/Bike/Availability/City/Tainan?%24format=JSON';

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

type TdxStation = {
  StationUID: string; StationID: string;
  StationName?: { Zh_tw?: string };
  StationAddress?: { Zh_tw?: string };
  StationPosition?: { PositionLat?: number; PositionLon?: number };
  BikesCapacity?: number;
  UpdateTime?: string;
};

type TdxAvailability = {
  StationUID: string; StationID: string; ServiceStatus: number;
  AvailableRentBikes: number; AvailableReturnBikes: number;
  AvailableRentBikesDetail?: { GeneralBikes?: number; ElectricBikes?: number };
  SrcUpdateTime?: string; UpdateTime?: string;
};

function tainanArea(address: string) {
  const m = address.match(/([\u4e00-\u9fff]{2,4}區)/);
  return m?.[1] ?? '台南市';
}

function statusOf(total: number, bikes: number, docks: number, active = true) {
  if (!active) return { level: 'bad' as const, label: '暫停營運', score: 100 };
  if (bikes === 0) return { level: 'bad' as const, label: '無車可借', score: 95 };
  if (docks === 0) return { level: 'bad' as const, label: '無位可還', score: 90 };
  const rentRatio = total ? bikes / total : 0;
  const returnRatio = total ? docks / total : 0;
  if (rentRatio < 0.15) return { level: 'warn' as const, label: '車輛偏少', score: 70 };
  if (returnRatio < 0.15) return { level: 'warn' as const, label: '空位偏少', score: 65 };
  return { level: 'ok' as const, label: '供需正常', score: 20 };
}

function summarize(stations: Station[]) {
  return {
    problem: stations.filter((s) => s.level !== 'ok').length,
    noBike: stations.filter((s) => s.label === '無車可借').length,
    noDock: stations.filter((s) => s.label === '無位可還').length,
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
  const [stationRes, availabilityRes] = await Promise.all([
    fetch(TAINAN_STATIONS, { next: { revalidate: 60 } }),
    fetch(TAINAN_AVAILABILITY, { next: { revalidate: 60 } }),
  ]);
  if (!stationRes.ok) throw new Error(`tainan_station_${stationRes.status}`);
  if (!availabilityRes.ok) throw new Error(`tainan_availability_${availabilityRes.status}`);
  const stationRows = (await stationRes.json()) as TdxStation[];
  const availabilityRows = (await availabilityRes.json()) as TdxAvailability[];
  const stationMap = new Map(stationRows.map((s) => [s.StationUID || s.StationID, s]));
  const stations = availabilityRows.map((a) => {
    const st = stationMap.get(a.StationUID || a.StationID);
    const address = st?.StationAddress?.Zh_tw ?? '台南市';
    const total = Number(st?.BikesCapacity || a.AvailableRentBikes + a.AvailableReturnBikes || 0);
    const bikes = Number(a.AvailableRentBikes || 0);
    const docks = Number(a.AvailableReturnBikes || 0);
    return {
      id: a.StationID,
      name: (st?.StationName?.Zh_tw ?? a.StationID).replace('YouBike2.0_', ''),
      area: tainanArea(address),
      address,
      total,
      bikes,
      docks,
      updatedAt: a.UpdateTime || a.SrcUpdateTime || st?.UpdateTime || '',
      lat: Number(st?.StationPosition?.PositionLat || 0),
      lng: Number(st?.StationPosition?.PositionLon || 0),
      eBikes: Number(a.AvailableRentBikesDetail?.ElectricBikes || 0),
      ...statusOf(total, bikes, docks, a.ServiceStatus === 1),
    } satisfies Station;
  });
  return { city: 'tainan', cityName: '台南', source: `${TAINAN_STATIONS} + ${TAINAN_AVAILABILITY}`, stations };
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
