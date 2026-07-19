import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '台北 YouBike 即時雷達',
  description: '用台北市 YouBike 2.0 即時開放資料做的 Vercel 測試專案',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="zh-Hant-TW"><body>{children}</body></html>;
}
