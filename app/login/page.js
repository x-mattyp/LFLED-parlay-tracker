import { redirect } from 'next/navigation';
import { currentMember } from '@/lib/session';
import { getMembers } from '@/lib/data';
import LoginForm from './form';

export default async function LoginPage() {
  if (await currentMember()) redirect('/');
  const members = await getMembers();
  return (
    <div className="login">
      <h1>Who&rsquo;s picking?</h1>
      <p className="muted">First time in? You&rsquo;ll set a 4-digit PIN.</p>
      <LoginForm names={members.map((m) => m.name)} />
    </div>
  );
}
