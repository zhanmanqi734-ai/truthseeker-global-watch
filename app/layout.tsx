import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '真探 TruthSeeker · 国际新闻涉华舆情监测',
  description: '私有国际新闻涉华舆情监测工作台',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
