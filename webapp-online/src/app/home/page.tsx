import { redirect } from 'next/navigation';

/** The old minimal accounts page is retired: Home is the Dashboard now. */
export default function Home() {
  redirect('/dashboard');
}
