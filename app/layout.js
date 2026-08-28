import { Space_Grotesk } from 'next/font/google';
import './globals.css';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk'
});

export const metadata = {
  title: 'OTP Uyeee',
  description: 'Soft Brutalism OTP service dashboard by OTP Uyeee'
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body className={`${spaceGrotesk.variable} font-display bg-bone text-ink`}>
        {children}
      </body>
    </html>
  );
}
