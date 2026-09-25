import './globals.css';
import Link from 'next/link';
import { currentMember } from '@/lib/session';
import { logout } from './actions';

export const metadata = { title: 'LFLED Picks', description: 'Weekly parlay pool for the LFLED league' };
export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };
export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }) {
  const me = await currentMember();
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700;800&family=Barlow:wght@400;500;600&display=swap"
        />
      </head>
      <body>
        <header className="masthead">
          <Link href="/" className="brand">LFLED Picks</Link>
          {me && (
            <nav>
              <Link href="/">This week</Link>
              <Link href="/stats">Season</Link>
              {me.is_admin && <Link href="/admin">Commish</Link>}
              <form action={logout}>
                <button className="linkish" title={`Signed in as ${me.name}`}>Log out</button>
              </form>
            </nav>
          )}
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
