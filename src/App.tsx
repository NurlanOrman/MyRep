import type { ReactNode } from 'react';
import { CalculatorPage } from './pages/Calculator';
import { ComparePage } from './pages/Compare';
import { DashboardPage } from './pages/Dashboard';
import { LoadsPage } from './pages/Loads';
import { ReportsPage } from './pages/Reports';
import { SettingsPage } from './pages/Settings';
import { WhatIfPage } from './pages/WhatIf';
import { useStore } from './state/store';
import { useRoute, type Route } from './ui/router';
import { useTheme } from './ui/theme';

const ICON: Record<string, ReactNode> = {
  dashboard: <path d="M4 13h6V4H4zm0 7h6v-5H4zm10 0h6v-9h-6zm0-16v5h6V4z" />,
  loads: <path d="M4 6h16M4 12h16M4 18h10" />,
  calc: <path d="M6 3h12v18H6zM9 7h6M9 12h.01M12 12h.01M15 12h.01M9 16h.01M12 16h.01M15 16h.01" />,
  compare: <path d="M8 4v16M16 4v16M4 8h8M12 16h8" />,
  reports: <path d="M5 20V10m5 10V4m5 16v-7m5 7V8" />,
  settings: <path d="M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm0-6v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1m-8.6 8.6-2.1 2.1" />,
};

const NAV: { route: Route; label: string }[] = [
  { route: 'dashboard', label: 'Dashboard' },
  { route: 'loads', label: 'Loads' },
  { route: 'calc', label: 'Calculator' },
  { route: 'compare', label: 'Compare' },
  { route: 'reports', label: 'Reports' },
  { route: 'settings', label: 'Settings' },
];

export function App() {
  const route = useRoute();
  const { compareIds } = useStore();
  const { theme, setTheme } = useTheme();
  const active = route === 'whatif' ? 'calc' : route;
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);

  return (
    <div className="shell">
      <nav className="nav" aria-label="Main">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">$</span>
          <span className="brand-name">Load Profit</span>
        </div>
        {NAV.map((n) => (
          <a key={n.route} href={`#/${n.route}`} className={`nav-item ${active === n.route ? 'active' : ''}`} aria-current={active === n.route ? 'page' : undefined}>
            <svg viewBox="0 0 24 24" aria-hidden="true">{ICON[n.route]}</svg>
            <span>{n.label}</span>
            {n.route === 'compare' && compareIds.length > 0 && <b className="badge">{compareIds.length}</b>}
          </a>
        ))}
        <button className="theme-toggle" onClick={() => setTheme(dark ? 'light' : 'dark')} aria-label="Toggle dark mode">
          {dark ? '☀︎' : '☾'}
        </button>
      </nav>
      <main className="main">
        {route === 'dashboard' && <DashboardPage />}
        {route === 'loads' && <LoadsPage />}
        {route === 'calc' && <CalculatorPage />}
        {route === 'compare' && <ComparePage />}
        {route === 'reports' && <ReportsPage />}
        {route === 'settings' && <SettingsPage />}
        {route === 'whatif' && <WhatIfPage />}
      </main>
    </div>
  );
}
