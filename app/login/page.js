import { redirect } from 'next/navigation';
import { currentMember } from '@/lib/session';
import { getMembers } from '@/lib/data';
import LoginForm from './form';

export default async function LoginPage() {
  if (await currentMember()) redirect('/');
  const members = await getMembers();
  const people = members
    .map((m) => ({
      id: m.id,
      name: m.name,
      team_name: m.team_name,
      team_abbr: m.team_abbr,
      // Only saved copies load before sign-in; ESPN links need the logo proxy.
      logo_url: m.logo_url || null,
    }))
    .sort((a, b) => (a.team_name || a.name).localeCompare(b.team_name || b.name));
  return (
    <div className="login">
      <img className="login-crest" src="/lfled-crest.svg" alt="LFLED: Loyola Fantasy League for Extraordinary Degenerates" width="180" height="180" />
      <h1>Who&rsquo;s picking?</h1>
      <p className="muted">Tap your team. First time in? You&rsquo;ll set a 4-digit PIN.</p>
      <LoginForm people={people} />
    </div>
  );
}
