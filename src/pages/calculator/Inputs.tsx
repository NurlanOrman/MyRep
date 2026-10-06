import type { LoadResult } from '../../engine/calculate';
import { EXPENSE_CATEGORIES, MANUAL_RISKS, AUTO_RISK_LABELS, newId } from '../../engine/defaults';
import type { AutoRiskKey, HoursInput, LoadInput, LoadStatus } from '../../engine/types';
import { Accordion, Check, NumberField, Segmented, SelectField, TextField } from '../../ui/components';
import { cents, hours, miles, money, rate3 } from '../../ui/format';
import { useStore } from '../../state/store';

type Setter = (fn: (d: LoadInput) => LoadInput) => void;

function useSetters(update: Setter) {
  return {
    set: (patch: Partial<LoadInput>) => update((d) => ({ ...d, ...patch })),
    rev: (patch: Partial<LoadInput['revenue']>) => update((d) => ({ ...d, revenue: { ...d.revenue, ...patch } })),
    fuel: (patch: Partial<LoadInput['fuel']>) => update((d) => ({ ...d, fuel: { ...d.fuel, ...patch } })),
    hrs: (patch: Partial<HoursInput>) => update((d) => ({ ...d, hours: { ...d.hours, ...patch } })),
    tolls: (patch: Partial<LoadInput['tolls']>) => update((d) => ({ ...d, tolls: { ...d.tolls, ...patch } })),
    asm: (patch: Partial<LoadInput['assumptions']>) => update((d) => ({ ...d, assumptions: { ...d.assumptions, ...patch } })),
    alloc: (patch: Partial<LoadInput['assumptions']['allocation']>) =>
      update((d) => ({ ...d, assumptions: { ...d.assumptions, allocation: { ...d.assumptions.allocation, ...patch } } })),
  };
}

// ───────────────────────── Quick inputs (the 30-second form) ─────────────────────────

export function QuickInputs({ load, r, brokers }: { load: LoadInput; r: LoadResult; brokers: string[] }) {
  const { updateDraft } = useStore();
  const s = useSetters(updateDraft);
  const totalMode = load.revenue.mode === 'total';
  const grossValue = totalMode ? load.revenue.totalGross : load.revenue.brokerRate;
  const autoHours = load.hours.mode === 'auto';
  const detailed = load.hours.mode === 'detailed';

  return (
    <div className="quick">
      <TextField label="Broker" value={load.broker} onChange={(v) => s.set({ broker: v })} placeholder="ABC Logistics" list="brokers" />
      <datalist id="brokers">
        {brokers.map((b) => (
          <option key={b} value={b} />
        ))}
      </datalist>
      <NumberField
        big
        label={totalMode ? 'Total gross (all-in)' : 'Gross / broker rate'}
        prefix="$"
        value={grossValue}
        onChange={(v) => (totalMode ? s.rev({ totalGross: v ?? 0 }) : s.rev({ brokerRate: v ?? 0 }))}
        hint={!totalMode && r.revenue.accessorials > 0 ? `+ ${money(r.revenue.accessorials)} accessorials = ${money(r.revenue.gross)}` : undefined}
      />
      <div className="pair">
        <TextField label="Pickup city" value={load.pickupCity} onChange={(v) => s.set({ pickupCity: v })} placeholder="City" />
        <TextField label="ST" value={load.pickupState} onChange={(v) => s.set({ pickupState: v })} placeholder="ST" maxLength={2} upper />
      </div>
      <div className="pair">
        <TextField label="Delivery city" value={load.deliveryCity} onChange={(v) => s.set({ deliveryCity: v })} placeholder="City" />
        <TextField label="ST" value={load.deliveryState} onChange={(v) => s.set({ deliveryState: v })} placeholder="ST" maxLength={2} upper />
      </div>
      <NumberField big label="Loaded miles" value={load.loadedMiles} onChange={(v) => s.set({ loadedMiles: v ?? 0 })} integer />
      <NumberField big label="Deadhead miles" value={load.deadheadMiles} onChange={(v) => s.set({ deadheadMiles: v ?? 0 })} integer />
      <div className="field computed">
        <span className="field-label">Total miles</span>
        <span className="computed-value">{miles(r.miles.total)}</span>
        <span className="field-hint">{r.miles.total > 0 ? `${r.miles.deadheadPct.toFixed(0)}% deadhead` : 'loaded + deadhead'}</span>
      </div>
      <NumberField
        big
        label="Work hours"
        value={detailed ? r.hours.total : autoHours ? null : load.hours.total}
        nullable
        readOnly={detailed}
        placeholder={autoHours ? `auto ${r.hours.total.toFixed(1)}` : '0'}
        onChange={(v) => s.hrs(v == null || v === 0 ? { mode: 'auto', total: 0 } : { mode: 'total', total: v })}
        hint={detailed ? 'from detailed breakdown' : autoHours ? 'auto: miles ÷ speed + stops' : undefined}
      />
      <NumberField big label="Diesel" prefix="$" suffix="/gal" value={load.fuel.dieselPrice} onChange={(v) => s.fuel({ dieselPrice: v ?? 0 })} />
      <NumberField big label="MPG (with trailer)" value={load.fuel.mpg} onChange={(v) => s.fuel({ mpg: v ?? 0, gallonsOverride: null })} />
    </div>
  );
}

// ───────────────────────── Advanced sections ─────────────────────────

const STATUS_OPTIONS: { value: LoadStatus; label: string }[] = [
  { value: 'offer', label: 'Offer (quote)' },
  { value: 'booked', label: 'Booked' },
  { value: 'completed', label: 'Completed' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'cancelled', label: 'Cancelled' },
];

export function AdvancedInputs({ load, r }: { load: LoadInput; r: LoadResult }) {
  const store = useStore();
  const { data, updateDraft, setDraftProfile, refreshDraftAssumptions } = store;
  const s = useSetters(updateDraft);
  const a = load.assumptions;
  const rv = load.revenue;
  const h = load.hours;
  const autoRisks = new Set(r.warnings.map((w) => w.key));

  const setExpense = (id: string, patch: Partial<LoadInput['expenses'][number]>) =>
    updateDraft((d) => ({ ...d, expenses: d.expenses.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));

  return (
    <div className="advanced">
      <Accordion title="Load details" summary={load.loadNumber || load.commodity || undefined}>
        <div className="form-grid">
          <SelectField label="Status" value={load.status} onChange={(v) => s.set({ status: v })} options={STATUS_OPTIONS} />
          <SelectField
            label="Equipment profile"
            value={load.profileId}
            onChange={(v) => setDraftProfile(v)}
            options={data.profiles.map((p) => ({ value: p.id, label: p.name }))}
          />
          <TextField label="Load ID" value={load.loadNumber} onChange={(v) => s.set({ loadNumber: v })} />
          <TextField label="Commodity" value={load.commodity} onChange={(v) => s.set({ commodity: v })} />
          <TextField label="Pickup date/time" type="datetime-local" value={load.pickupAt} onChange={(v) => s.set({ pickupAt: v })} />
          <TextField label="Delivery date/time" type="datetime-local" value={load.deliveryAt} onChange={(v) => s.set({ deliveryAt: v })} />
          <TextField label="Trailer type" value={load.trailerType} onChange={(v) => s.set({ trailerType: v })} />
          <NumberField label="Load weight" suffix="lbs" value={load.weightLbs} onChange={(v) => s.set({ weightLbs: v ?? 0 })} integer
            hint={a.payloadCapacityLbs ? `payload capacity ${miles(a.payloadCapacityLbs)} lbs` : undefined} />
          <NumberField label="Number of stops" value={load.stops} onChange={(v) => s.set({ stops: Math.max(1, v ?? 2) })} integer hint="incl. pickup & delivery" />
          <TextField label="Invoiced date" type="date" value={load.invoicedAt} onChange={(v) => s.set({ invoicedAt: v })} />
          <TextField label="Paid date" type="date" value={load.paidAt} onChange={(v) => s.set({ paidAt: v })} />
          <TextField label="Notes" value={load.notes} onChange={(v) => s.set({ notes: v })} />
        </div>
      </Accordion>

      <Accordion title="Revenue" summary={money(r.revenue.gross)}>
        <Segmented
          label="Revenue mode"
          value={rv.mode}
          onChange={(v) => s.rev({ mode: v, ...(v === 'total' && !rv.totalGross ? { totalGross: r.revenue.gross } : {}) })}
          options={[
            { value: 'itemized', label: 'Itemized' },
            { value: 'total', label: 'One total' },
          ]}
        />
        {rv.mode === 'total' ? (
          <NumberField label="Total gross (all-in)" prefix="$" value={rv.totalGross} onChange={(v) => s.rev({ totalGross: v ?? 0 })} />
        ) : (
          <div className="form-grid">
            <NumberField label="Broker rate (linehaul)" prefix="$" value={rv.brokerRate} onChange={(v) => s.rev({ brokerRate: v ?? 0 })} />
            <NumberField label="Fuel surcharge" prefix="$" value={rv.fuelSurcharge} onChange={(v) => s.rev({ fuelSurcharge: v ?? 0 })} />
            <NumberField label="Detention" prefix="$" value={rv.detention} onChange={(v) => s.rev({ detention: v ?? 0 })} />
            <NumberField label="Layover" prefix="$" value={rv.layover} onChange={(v) => s.rev({ layover: v ?? 0 })} />
            <NumberField label="Tarp fee" prefix="$" value={rv.tarpFee} onChange={(v) => s.rev({ tarpFee: v ?? 0 })} />
            <NumberField label="Stop-off fee" prefix="$" value={rv.stopOffFee} onChange={(v) => s.rev({ stopOffFee: v ?? 0 })} />
            <NumberField label="Other accessorials" prefix="$" value={rv.otherAccessorials} onChange={(v) => s.rev({ otherAccessorials: v ?? 0 })} />
            <div className="field computed">
              <span className="field-label">Total gross</span>
              <span className="computed-value">{cents(r.revenue.gross)}</span>
            </div>
          </div>
        )}
        <NumberField label="Factoring fee" suffix="% of gross" value={a.factoringPct} onChange={(v) => s.asm({ factoringPct: v ?? 0 })} />
      </Accordion>

      <Accordion title="Fuel & DEF" summary={money(r.costs.fuel + r.costs.def)}>
        <div className="form-grid">
          <NumberField label="Diesel price" prefix="$" suffix="/gal" value={load.fuel.dieselPrice} onChange={(v) => s.fuel({ dieselPrice: v ?? 0 })} />
          <NumberField label="MPG with trailer" value={load.fuel.mpg} onChange={(v) => s.fuel({ mpg: v ?? 0 })} />
          <NumberField label="MPG adjustment (this load)" suffix="%" allowNegative value={load.fuel.mpgAdjustmentPct}
            onChange={(v) => s.fuel({ mpgAdjustmentPct: v ?? 0 })} hint="e.g. −10 for heavy load / headwind" />
          <NumberField label="Gallons override" suffix="gal" nullable value={load.fuel.gallonsOverride}
            placeholder={r.fuel.calculatedGallons.toFixed(1)} onChange={(v) => s.fuel({ gallonsOverride: v })}
            hint={`calculated: ${r.fuel.calculatedGallons.toFixed(1)} gal`} />
          <NumberField label="Starting fuel in tank" suffix="gal" value={load.fuel.startingFuel} onChange={(v) => s.fuel({ startingFuel: v ?? 0 })} />
          <NumberField label="Tank capacity" suffix="gal" value={load.fuel.tankGallons} onChange={(v) => s.fuel({ tankGallons: v ?? 0 })} />
          <NumberField label="DEF price" prefix="$" suffix="/gal" value={load.fuel.defPricePerGallon} onChange={(v) => s.fuel({ defPricePerGallon: v ?? 0 })} />
          <NumberField label="DEF consumption" suffix="% of diesel" value={load.fuel.defPctOfDiesel} onChange={(v) => s.fuel({ defPctOfDiesel: v ?? 0 })} />
        </div>
      </Accordion>

      <Accordion title="Vehicle reserves" summary={money(r.costs.maintenance + r.costs.tires + r.costs.trailerMaintenance)}>
        <div className="form-grid">
          <NumberField label="Truck maintenance reserve" prefix="$" suffix="/mi" value={a.maintenancePerMile}
            onChange={(v) => s.asm({ maintenancePerMile: v ?? 0 })} hint={`oil, brakes, repairs → ${cents(r.costs.maintenance)}`} />
          <NumberField label="Tire reserve" prefix="$" suffix="/mi" value={a.tirePerMile} onChange={(v) => s.asm({ tirePerMile: v ?? 0 })} hint={cents(r.costs.tires)} />
          <NumberField label="Trailer maintenance" prefix="$" suffix="/mi" value={a.trailerMaintenancePerMile}
            onChange={(v) => s.asm({ trailerMaintenancePerMile: v ?? 0 })} hint={cents(r.costs.trailerMaintenance)} />
        </div>
      </Accordion>

      <Accordion title="Fixed cost allocation" summary={money(r.costs.fixed.allocated)}>
        <Segmented
          label="Allocation method"
          value={a.allocation.method}
          onChange={(v) => s.alloc({ method: v })}
          options={[
            { value: 'perMile', label: 'Per mile' },
            { value: 'perDay', label: 'Per day' },
            { value: 'perLoad', label: 'Per load' },
          ]}
        />
        <div className="form-grid">
          <NumberField label="Monthly fixed costs" prefix="$" value={a.monthlyFixedCosts} onChange={(v) => s.asm({ monthlyFixedCosts: v ?? 0 })} hint="from Settings + equipment" />
          {a.allocation.method === 'perMile' && (
            <NumberField label="Expected monthly miles" value={a.allocation.expectedMonthlyMiles} onChange={(v) => s.alloc({ expectedMonthlyMiles: v ?? 0 })} integer
              hint={`${rate3(r.costs.fixed.rate)}/mi`} />
          )}
          {a.allocation.method === 'perDay' && (
            <>
              <NumberField label="Working days / month" value={a.allocation.workingDaysPerMonth} onChange={(v) => s.alloc({ workingDaysPerMonth: v ?? 0 })} hint={`${cents(r.costs.fixed.rate)}/day`} />
              <NumberField label="Work hours / day" value={a.allocation.workHoursPerDay} onChange={(v) => s.alloc({ workHoursPerDay: v ?? 0 })} />
              <NumberField label="Trip days override" nullable value={load.tripDaysOverride} onChange={(v) => s.set({ tripDaysOverride: v })}
                placeholder={r.costs.fixed.basis.toFixed(2)} hint={`using ${r.costs.fixed.basis.toFixed(2)} days`} />
            </>
          )}
          {a.allocation.method === 'perLoad' && (
            <NumberField label="Expected loads / month" value={a.allocation.expectedLoadsPerMonth} onChange={(v) => s.alloc({ expectedLoadsPerMonth: v ?? 0 })} integer
              hint={`${cents(r.costs.fixed.rate)}/load`} />
          )}
        </div>
        <button type="button" className="btn ghost small" onClick={refreshDraftAssumptions}>
          Reload costs from Settings &amp; equipment
        </button>
      </Accordion>

      <Accordion title="Tolls" summary={money(r.costs.tolls)}>
        <div className="form-grid">
          <NumberField label="Estimated tolls" prefix="$" value={load.tolls.estimated} onChange={(v) => s.tolls({ estimated: v ?? 0 })} />
          <NumberField label="Transponder fees" prefix="$" value={load.tolls.transponderFees} onChange={(v) => s.tolls({ transponderFees: v ?? 0 })} />
          <TextField label="Toll roads" value={load.tolls.roads} onChange={(v) => s.tolls({ roads: v })} placeholder="I-76 PA Turnpike…" />
        </div>
      </Accordion>

      <Accordion title="Time & your labor" summary={`${hours(r.hours.total)} · ${money(r.profit.laborValue)}`}>
        <Segmented
          label="Hours mode"
          value={h.mode}
          onChange={(v) => {
            if (v === 'detailed' && h.mode !== 'detailed' && r.hours.breakdown) s.hrs({ mode: v, ...r.hours.breakdown });
            else s.hrs({ mode: v });
          }}
          options={[
            { value: 'auto', label: 'Auto' },
            { value: 'total', label: 'Total' },
            { value: 'detailed', label: 'Detailed' },
          ]}
        />
        <div className="form-grid">
          <NumberField label="Target hourly rate (you)" prefix="$" suffix="/h" value={a.targetHourlyRate} onChange={(v) => s.asm({ targetHourlyRate: v ?? 0 })} />
          {h.mode === 'total' && <NumberField label="Total work hours" value={h.total} onChange={(v) => s.hrs({ total: v ?? 0 })} />}
          {h.mode === 'detailed' && (
            <>
              <NumberField label="Driving (loaded)" suffix="h" value={h.driving} onChange={(v) => s.hrs({ driving: v ?? 0 })} />
              <NumberField label="Deadhead driving" suffix="h" value={h.deadheadDriving} onChange={(v) => s.hrs({ deadheadDriving: v ?? 0 })} />
              <NumberField label="Loading" suffix="h" value={h.loading} onChange={(v) => s.hrs({ loading: v ?? 0 })} />
              <NumberField label="Unloading" suffix="h" value={h.unloading} onChange={(v) => s.hrs({ unloading: v ?? 0 })} />
              <NumberField label="Fueling" suffix="h" value={h.fueling} onChange={(v) => s.hrs({ fueling: v ?? 0 })} />
              <NumberField label="Inspection" suffix="h" value={h.inspection} onChange={(v) => s.hrs({ inspection: v ?? 0 })} />
            </>
          )}
          {h.mode !== 'total' && (
            <>
              <NumberField label="Waiting" suffix="h" value={h.waiting} onChange={(v) => s.hrs({ waiting: v ?? 0 })} />
              <NumberField label="Other work" suffix="h" value={h.other} onChange={(v) => s.hrs({ other: v ?? 0 })} />
            </>
          )}
          {h.mode === 'total' && (
            <NumberField label="Expected waiting (for score)" suffix="h" value={h.waiting} onChange={(v) => s.hrs({ waiting: v ?? 0 })} hint="included in total" />
          )}
          {h.mode === 'auto' && (
            <>
              <NumberField label="Avg speed" suffix="mph" value={a.avgSpeedMph} onChange={(v) => s.asm({ avgSpeedMph: v ?? 0 })} />
              <NumberField label="Hours per stop" suffix="h" value={a.hoursPerStop} onChange={(v) => s.asm({ hoursPerStop: v ?? 0 })} />
            </>
          )}
        </div>
        <div className="kv">
          Total work hours <b>{hours(r.hours.total)}</b> × {cents(a.targetHourlyRate)}/h = owner labor <b>{cents(r.profit.laborValue)}</b>
        </div>
      </Accordion>

      <Accordion title="Other trip expenses" summary={money(r.costs.otherExpenses)}>
        <div className="expenses">
          {load.expenses.map((e) => (
            <div key={e.id} className="expense-row">
              <SelectField
                label="Category"
                value={e.category}
                onChange={(v) => setExpense(e.id, { category: v })}
                options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: c }))}
              />
              <NumberField label="Amount" prefix="$" value={e.amount} onChange={(v) => setExpense(e.id, { amount: v ?? 0 })} />
              <TextField label="Notes" value={e.notes} onChange={(v) => setExpense(e.id, { notes: v })} />
              <button
                type="button"
                className="btn icon danger"
                aria-label={`Remove ${e.category}`}
                onClick={() => updateDraft((d) => ({ ...d, expenses: d.expenses.filter((x) => x.id !== e.id) }))}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <div className="chips">
          {EXPENSE_CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              className="chip"
              onClick={() => updateDraft((d) => ({ ...d, expenses: [...d.expenses, { id: newId(), category: c, amount: 0, notes: '' }] }))}
            >
              + {c}
            </button>
          ))}
        </div>
      </Accordion>

      <Accordion title="Risk checklist" summary={r.score ? `−${r.score.penalty} pts` : undefined}>
        <div className="checks">
          {(Object.keys(AUTO_RISK_LABELS) as AutoRiskKey[]).map((k) => (
            <Check key={k} label={AUTO_RISK_LABELS[k]} checked={autoRisks.has(k)} tag="auto" />
          ))}
          {MANUAL_RISKS.map((m) => (
            <Check
              key={m.key}
              label={m.label}
              checked={!!load.risks[m.key]}
              tag={`−${data.settings.riskPenalties[m.key]}`}
              onChange={(v) => updateDraft((d) => ({ ...d, risks: { ...d.risks, [m.key]: v } }))}
            />
          ))}
        </div>
        <p className="note">“auto” risks are measured from your numbers and already reflected in the score. Checked manual risks subtract penalty points.</p>
      </Accordion>

      <Accordion title="Target profit, negotiation & tax">
        <div className="form-grid">
          <NumberField label="Target profit (this load)" prefix="$" nullable value={load.targetProfitOverride}
            placeholder={String(Math.round(r.breakEven.targetProfit))} onChange={(v) => s.set({ targetProfitOverride: v })}
            hint={load.targetProfitOverride ? 'override' : a.targetProfitMode === 'perMile' ? `default ${cents(a.targetProfitPerMile)}/mi` : 'default per load'} />
          <NumberField label="Negotiation room" suffix="%" value={a.negotiationBufferPct} onChange={(v) => s.asm({ negotiationBufferPct: v ?? 0 })} />
          <NumberField label="Effective tax rate" suffix="%" value={a.taxRatePct} onChange={(v) => s.asm({ taxRatePct: v ?? 0 })} />
        </div>
      </Accordion>
    </div>
  );
}
