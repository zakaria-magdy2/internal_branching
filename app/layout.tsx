// app/layout.tsx
import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'التنسيق الداخلي - كلية العلوم جامعة قناة السويس',
  description: 'منصة التنسيق والتشعيب الداخلي لكلية العلوم جامعة قناة السويس',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <link rel="icon" href="/images/science-logo.png" />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
