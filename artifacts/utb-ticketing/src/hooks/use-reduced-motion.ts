import * as React from 'react';

export function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = React.useState(false);

  React.useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setPrefersReducedMotion(mql.matches);
    mql.addEventListener('change', onChange);
    setPrefersReducedMotion(mql.matches);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return prefersReducedMotion;
}
