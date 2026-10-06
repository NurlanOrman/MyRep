import { useEffect, useState } from 'react';

export type Route = 'dashboard' | 'loads' | 'calc' | 'compare' | 'reports' | 'settings' | 'whatif';
const ROUTES: Route[] = ['dashboard', 'loads', 'calc', 'compare', 'reports', 'settings', 'whatif'];

function parse(): Route {
  const h = window.location.hash.replace(/^#\/?/, '');
  return (ROUTES as string[]).includes(h) ? (h as Route) : 'calc';
}

export function navigate(r: Route) {
  window.location.hash = `/${r}`;
  window.scrollTo({ top: 0 });
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(parse);
  useEffect(() => {
    const on = () => setRoute(parse());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
