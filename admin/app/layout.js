import './globals.css';

export const metadata = {
  title: 'QARO Analytics',
  description: 'Customer journey + ads analytics',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
