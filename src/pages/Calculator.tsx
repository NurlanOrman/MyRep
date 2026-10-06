import { useMemo, useState } from 'react';
import { calculateLoad } from '../engine/calculate';
import { useStore } from '../state/store';
import { navigate } from '../ui/router';
import { money } from '../ui/format';
import { AdvancedInputs, QuickInputs } from './calculator/Inputs';
import { DecisionBanner, DecisionNumbers, KeyMetrics, Warnings, decisionTone } from './calculator/ResultSummary';
import { DeadheadCard, FuelCard, Negotiation, ProfitBreakdown, ScoreCard, TaxCard, TimeCard } from './calculator/Analysis';

export function CalculatorPage() {
  const { data, draft, draftSaved, saveDraft, newDraft, toggleCompare, compareIds } = useStore();
  const settings = data.settings;
  const r = useMemo(() => calculateLoad(draft, settings), [draft, settings]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [flash, setFlash] = useState('');
  const brokers = useMemo(() => [...new Set(data.loads.map((l) => l.broker.trim()).filter(Boolean))].sort(), [data.loads]);
  const isExisting = data.loads.some((l) => l.id === draft.id);

  const notify = (msg: string) => {
    setFlash(msg);
    setTimeout(() => setFlash(''), 2000);
  };

  const save = () => {
    saveDraft();
    notify(isExisting ? 'Load updated' : 'Load saved');
  };

  const compare = () => {
    saveDraft();
    if (!compareIds.includes(draft.id)) toggleCompare(draft.id);
    navigate('compare');
  };

  return (
    <div className="calc">
      <div className="page-head calc-head">
        <div>
          <h1>{isExisting ? 'Edit load' : 'New load'}</h1>
          <p className="muted">{isExisting ? (draftSaved ? 'All changes saved' : 'Unsaved changes') : 'Results update as you type'}</p>
        </div>
        <button type="button" className="btn ghost" onClick={newDraft}>
          + New
        </button>
      </div>

      <section className="area-quick card" aria-label="Quick load input">
        <QuickInputs load={draft} r={r} brokers={brokers} />
      </section>

      <aside className="area-side" aria-label="Result">
        <div className="side-sticky">
          <DecisionBanner r={r} />
          <Warnings r={r} />
          <KeyMetrics r={r} />
          {r.ready && <DecisionNumbers r={r} />}
          <div className="actions">
            <button type="button" className="btn primary" onClick={save}>
              {isExisting ? 'Update load' : 'Save load'}
            </button>
            <button type="button" className="btn" onClick={compare} disabled={!r.ready}>
              Compare
            </button>
            <button type="button" className="btn" onClick={() => navigate('whatif')} disabled={!r.ready}>
              What if?
            </button>
          </div>
          {flash && (
            <div className="toast" role="status">
              ✓ {flash}
            </div>
          )}
        </div>
      </aside>

      <section className="area-adv">
        <button type="button" className="btn block outline" aria-expanded={showAdvanced} onClick={() => setShowAdvanced((v) => !v)}>
          {showAdvanced ? '− Hide details' : '+ Add more expenses & details'}
        </button>
        {showAdvanced && <AdvancedInputs load={draft} r={r} />}
      </section>

      <section className="area-analysis">
        <ProfitBreakdown r={r} load={draft} />
        <Negotiation r={r} load={draft} />
        <ScoreCard r={r} />
        <TimeCard r={r} />
        <DeadheadCard r={r} threshold={settings.warnings.deadheadPct} />
        <FuelCard r={r} load={draft} settings={settings} />
        <TaxCard r={r} />
      </section>

      {/* Mobile: always-visible verdict while typing */}
      <div className={`mobile-verdict tone-${decisionTone(r.decision.decision)}`} aria-hidden="true">
        <span className="mv-decision">{r.decision.decision ?? '—'}</span>
        <span className="mv-item">
          <small>Op. profit</small>
          {money(r.profit.operating)}
        </span>
        <span className="mv-item">
          <small>Economic</small>
          {money(r.profit.economic)}
        </span>
        <span className="mv-item">
          <small>Score</small>
          {r.score?.total ?? '–'}
        </span>
      </div>
    </div>
  );
}
