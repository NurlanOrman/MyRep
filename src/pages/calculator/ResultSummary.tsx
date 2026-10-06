import type { LoadResult } from '../../engine/calculate';
import type { Decision } from '../../engine/types';
import { Metric, type Tone } from '../../ui/components';
import { hourly, money, pct, rate } from '../../ui/format';

export const scoreTone = (t: string | undefined): Tone =>
  t === 'excellent' || t === 'good' ? 'good' : t === 'marginal' ? 'warn' : t === 'risky' ? 'serious' : t === 'bad' ? 'bad' : 'neutral';

export const decisionTone = (d: Decision | null): Tone => (d === 'TAKE' ? 'good' : d === 'NEGOTIATE' ? 'warn' : d === 'REJECT' ? 'bad' : 'neutral');

const DECISION_ICON: Record<Decision, string> = { TAKE: '✓', NEGOTIATE: '↔', REJECT: '✕' };
const SCORE_ICON: Record<string, string> = { excellent: '●', good: '●', marginal: '▲', risky: '▲', bad: '✕' };

export function ScoreRing({ score, tone, size = 92 }: { score: number | null; tone: Tone; size?: number }) {
  const r = 40;
  const c = 2 * Math.PI * r;
  const p = score == null ? 0 : score / 100;
  return (
    <svg className={`score-ring tone-${tone}`} width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={`Load score ${score ?? 'not available'} of 100`}>
      <circle cx="50" cy="50" r={r} className="ring-track" />
      <circle cx="50" cy="50" r={r} className="ring-fill" strokeDasharray={`${c * p} ${c}`} transform="rotate(-90 50 50)" />
      <text x="50" y="50" className="ring-num" dominantBaseline="central" textAnchor="middle">
        {score ?? '–'}
      </text>
    </svg>
  );
}

export function DecisionBanner({ r }: { r: LoadResult }) {
  const d = r.decision.decision;
  const tone = decisionTone(d);
  const sTone = scoreTone(r.score?.tone);
  return (
    <div className={`decision tone-${tone}`}>
      <div className="decision-main">
        <div className="decision-kicker">Decision</div>
        <div className="decision-word">
          {d ? (
            <>
              <span aria-hidden="true">{DECISION_ICON[d]}</span> {d}
            </>
          ) : (
            'Waiting for input'
          )}
        </div>
        <div className="decision-headline">{r.decision.headline}</div>
        {r.score && (
          <div className={`score-label tone-${sTone}`}>
            <span aria-hidden="true">{SCORE_ICON[r.score.tone]}</span> {r.score.label}
          </div>
        )}
      </div>
      <div className="decision-score">
        <ScoreRing score={r.score?.total ?? null} tone={sTone} />
        <div className="decision-score-cap">Load score</div>
      </div>
    </div>
  );
}

export function KeyMetrics({ r }: { r: LoadResult }) {
  const pTone = (v: number): Tone => (!r.ready || v === 0 ? 'neutral' : v > 0 ? 'good' : 'bad');
  return (
    <div className="metric-grid">
      <Metric label="Gross" value={money(r.revenue.gross)} sub={r.revenue.accessorials ? `incl. ${money(r.revenue.accessorials)} accessorials` : undefined} />
      <Metric label="Total cost" value={money(r.costs.totalCost)} sub={`${money(r.costs.tripExpenses)} trip + ${money(r.costs.fixed.allocated)} fixed`} />
      <Metric label="Operating profit" value={money(r.profit.operating)} tone={pTone(r.profit.operating)} sub="before your labor" big />
      <Metric label="Economic profit" value={money(r.profit.economic)} tone={pTone(r.profit.economic)} sub={`after ${money(r.profit.laborValue)} your labor`} big />
      <Metric label="Profit margin" value={pct(r.profit.operatingMarginPct)} sub={`economic ${pct(r.profit.economicMarginPct)}`} />
      <Metric label="Profit / hour" value={hourly(r.perHour.operating)} sub={r.perHour.economic != null ? `economic ${hourly(r.perHour.economic)}` : 'enter hours'} />
      <Metric label="Profit / total mile" value={rate(r.perMile.operatingPerTotal)} sub={`economic ${rate(r.perMile.economicPerTotal)}`} />
      <Metric label="Gross / loaded mile" value={rate(r.perMile.grossPerLoaded)} />
      <Metric label="Gross / total mile" value={rate(r.perMile.grossPerTotal)} sub={`cost ${rate(r.perMile.costPerTotal)}/mi`} />
    </div>
  );
}

export function DecisionNumbers({ r }: { r: LoadResult }) {
  const be = r.breakEven;
  return (
    <div className="decision-numbers">
      <div>
        <span>Broker offer</span>
        <strong>{money(r.revenue.gross)}</strong>
      </div>
      <div>
        <span>Minimum acceptable</span>
        <strong>{money(be.minimumRounded)}</strong>
      </div>
      <div>
        <span>Safety margin</span>
        <strong className={be.safetyMargin >= 0 ? 'pos' : 'neg'}>{money(be.safetyMargin)}</strong>
      </div>
      <div>
        <span>Ask broker</span>
        <strong>{money(Math.max(be.negotiationTarget, r.revenue.gross))}</strong>
      </div>
    </div>
  );
}

export function Warnings({ r }: { r: LoadResult }) {
  if (!r.warnings.length) return null;
  return (
    <ul className="warnings">
      {r.warnings.map((w) => (
        <li key={w.key}>
          <span aria-hidden="true">⚠️</span> <strong>{w.label.toUpperCase()}:</strong> {w.message}
        </li>
      ))}
    </ul>
  );
}
