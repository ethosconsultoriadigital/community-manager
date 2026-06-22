'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/lib/auth';

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    router.replace(user ? '/inicio' : '/login');
  }, [user, loading, router]);

  return (
    <div className="flex min-h-screen items-center justify-center text-slate-400">
      Redirigiendo…
    </div>
  );
}
