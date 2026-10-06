import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

// ───────────────────────── Inputs ─────────────────────────

interface NumberFieldProps {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  prefix?: string;
  suffix?: string;
  placeholder?: string;
  hint?: ReactNode;
  allowNegative?: boolean;
  /** When true, an empty field yields null instead of 0. */
  nullable?: boolean;
  big?: boolean;
  readOnly?: boolean;
  integer?: boolean;
}

function parseNumber(s: string, allowNegative: boolean): number | null {
  const cleaned = s.replace(/[$,\s]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return allowNegative ? n : Math.abs(n);
}

function display(v: number | null): string {
  if (v == null) return '';
  return String(Math.round(v * 10000) / 10000);
}

export function NumberField({
  label,
  value,
  onChange,
  prefix,
  suffix,
  placeholder,
  hint,
  allowNegative = false,
  nullable = false,
  big = false,
  readOnly = false,
  integer = false,
}: NumberFieldProps) {
  const id = useId();
  const [text, setText] = useState(value ? display(value) : '');
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(value ? display(value) : value === 0 && nullable ? '0' : '');
  }, [value, nullable]);

  return (
    <div className={`field ${big ? 'field-big' : ''}`}>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <span className={`field-box ${readOnly ? 'readonly' : ''}`}>
        {prefix && <span className="affix">{prefix}</span>}
        <input
          id={id}
          type="text"
          inputMode={integer ? 'numeric' : 'decimal'}
          autoComplete="off"
          enterKeyHint="next"
          value={text}
          placeholder={placeholder ?? '0'}
          readOnly={readOnly}
          onFocus={(e) => {
            focused.current = true;
            e.currentTarget.select();
          }}
          onBlur={() => {
            focused.current = false;
            setText(value ? display(value) : '');
          }}
          onChange={(e) => {
            const s = e.target.value;
            setText(s);
            const n = parseNumber(s, allowNegative);
            onChange(n == null ? (nullable ? null : 0) : integer ? Math.round(n) : n);
          }}
        />
        {suffix && <span className="affix">{suffix}</span>}
      </span>
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  list,
  maxLength,
  upper,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: 'text' | 'datetime-local' | 'date' | 'search';
  list?: string;
  maxLength?: number;
  upper?: boolean;
}) {
  const id = useId();
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <span className="field-box">
        <input
          id={id}
          type={type}
          value={value}
          list={list}
          maxLength={maxLength}
          placeholder={placeholder}
          autoCapitalize={upper ? 'characters' : 'words'}
          onChange={(e) => onChange(upper ? e.target.value.toUpperCase() : e.target.value)}
        />
      </span>
    </div>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  const id = useId();
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <span className="field-box">
        <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </span>
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={value === o.value ? 'on' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Check({ label, checked, onChange, tag }: { label: string; checked: boolean; onChange?: (v: boolean) => void; tag?: string }) {
  return (
    <label className={`check ${checked ? 'on' : ''} ${onChange ? '' : 'locked'}`}>
      <input type="checkbox" checked={checked} disabled={!onChange} onChange={(e) => onChange?.(e.target.checked)} />
      <span className="check-box" aria-hidden="true">
        {checked ? '✓' : ''}
      </span>
      <span className="check-label">{label}</span>
      {tag && <span className="check-tag">{tag}</span>}
    </label>
  );
}

// ───────────────────────── Layout ─────────────────────────

export function Card({ title, children, actions, className = '' }: { title?: ReactNode; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="card-head">
          {title && <h2>{title}</h2>}
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Accordion({ title, summary, children, open }: { title: string; summary?: ReactNode; children: ReactNode; open?: boolean }) {
  return (
    <details className="accordion" open={open}>
      <summary>
        <span className="acc-title">{title}</span>
        {summary != null && <span className="acc-summary">{summary}</span>}
        <span className="acc-chevron" aria-hidden="true">
          ›
        </span>
      </summary>
      <div className="acc-body">{children}</div>
    </details>
  );
}

export type Tone = 'good' | 'warn' | 'serious' | 'bad' | 'neutral';

export function Metric({
  label,
  value,
  sub,
  tone = 'neutral',
  big,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: Tone;
  big?: boolean;
}) {
  return (
    <div className={`metric tone-${tone} ${big ? 'metric-big' : ''}`}>
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      {sub && <div className="metric-sub">{sub}</div>}
    </div>
  );
}

export function Progress({ label, actual, target, format }: { label: string; actual: number; target: number; format: (v: number) => string }) {
  const p = target > 0 ? (actual / target) * 100 : 0;
  const tone: Tone = p >= 100 ? 'good' : 'neutral';
  return (
    <div className="progress">
      <div className="progress-top">
        <span className="progress-label">{label}</span>
        <span className="progress-val">
          {format(actual)} <span className="muted">/ {format(target)}</span>
        </span>
      </div>
      <div className="progress-track" role="progressbar" aria-valuenow={Math.round(p)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className={`progress-fill tone-bg-${tone}`} style={{ width: `${Math.min(100, Math.max(0, p))}%` }} />
      </div>
      <div className="progress-pct">{p.toFixed(1)}%</div>
    </div>
  );
}

/** Two-column "label … value" line used in breakdowns. */
export function Line({ label, value, strong, minus, muted, hint }: { label: ReactNode; value: ReactNode; strong?: boolean; minus?: boolean; muted?: boolean; hint?: ReactNode }) {
  return (
    <div className={`line ${strong ? 'strong' : ''} ${muted ? 'muted' : ''}`}>
      <span className="line-label">
        {minus && <span className="minus">−</span>}
        {label}
        {hint && <span className="line-hint">{hint}</span>}
      </span>
      <span className="line-value">{value}</span>
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-title">{title}</div>
      {children}
    </div>
  );
}

export function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
