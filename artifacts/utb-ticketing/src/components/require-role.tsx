import { useEffect, type ReactNode } from 'react';
import { useLocation } from 'wouter';
import { useGetMe } from '@workspace/api-client-react';
import { Spinner } from '@/components/ui/spinner';

type Role = 'passenger' | 'clerk' | 'admin';

interface RequireRoleProps {
  roles: Role[];
  children: ReactNode;
}

export function RequireRole({ roles, children }: RequireRoleProps) {
  const { data: user, isLoading } = useGetMe({ query: { retry: false } });
  const [, setLocation] = useLocation();

  const authorized = !!user && roles.includes(user.role);

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      setLocation('/login');
    } else if (!authorized) {
      setLocation('/');
    }
  }, [isLoading, user, authorized, setLocation]);

  if (isLoading || !authorized) {
    return (
      <div className="flex items-center justify-center py-32">
        <Spinner className="size-8" />
      </div>
    );
  }

  return <>{children}</>;
}
