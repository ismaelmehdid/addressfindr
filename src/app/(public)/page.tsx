import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/application/me/get-current-user';

export default async function HomePage(): Promise<never> {
  const currentUser = await getCurrentUser();
  if (currentUser.isErr()) redirect('/sign-in');
  if (currentUser.value.hasRedeemedAccess) redirect('/dashboard');
  redirect('/onboarding');
}
