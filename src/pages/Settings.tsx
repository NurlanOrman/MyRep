import { useState } from 'react';
import {
  AUTO_RISK_LABELS,
  BUSINESS_FIXED_LABELS,
  DEFAULT_PROFILE,
  DEFAULT_SETTINGS,
  MANUAL_RISKS,
  monthlyFixedCosts,
  newId,
  profileLoadedMpg,
} from '../engine/defaults';
import type { EquipmentProfile, ScoringSettings, Settings, WarningThresholds } from '../engine/types';
import { useStore } from '../state/store';
import { Accordion, Card, NumberField, Segmented, SelectField, TextField } from '../ui/components';
import { cents, money, rate3 } from '../ui/format';
import { useTheme } from '../ui/theme';
import { DataTools } from './Reports';

const SCORE_LABELS: Record<Exclude<keyof ScoringSettings, 'tripLength'>, [string, string]> = {
  profitPerMile: ['Profit / total mile', '$'],
  profitPerHour: ['Profit / work hour', '$'],
  economicProfit: ['Economic profit', '$'],
  margin: ['Operating margin', '%'],
  revenuePerMile: ['Revenue / total mile', '$'],
  deadheadPct: ['Deadhead', '%'],
  fuelPctOfGross: ['Fuel % of gross', '%'],
  tollPctOfGross: ['Tolls % of gross', '%'],
  stops: ['Stops', ''],
  waitingHours: ['Waiting hours', 'h'],
  weightPctOfPayload: ['Weight % of payload', '%'],
};

const WARN_KEY: Record<keyof WarningThresholds, keyof typeof AUTO_RISK_LABELS> = {
  deadheadPct: 'highDeadhead',
  marginPct: 'lowMargin',
  stops: 'tooManyStops',
  waitingHours: 'longWaiting',
  tollPctOfGross: 'tollHeavy',
  fuelPctOfGross: 'highFuelExposure',
  weightPctOfPayload: 'heavyLoad',
};

export function SettingsPage() {
  const { data, updateSettings, activeProfile } = useStore();
  const s = data.settings;
  const { theme, setTheme } = useTheme();
  const set = (patch: Partial<Settings>) => updateSettings((x) => ({ ...x, ...patch }));
  const fixedTotal = monthlyFixedCosts(s, activeProfile);
  const al = s.allocation;

  return (
    <div className="page settings">
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p className="muted">Defaults for NEW loads. Saved loads keep the numbers they were calculated with.</p>
        </div>
      </div>

      <Card title="Appearance">
        <Segmented
          label="Theme"
          value={theme}
          onChange={setTheme}
          options={[
            { value: 'system', label: 'Auto' },
            { value: 'dark', label: 'Dark' },
            { value: 'light', label: 'Light' },
          ]}
        />
      </Card>

      <Profiles />

      <Card title="Fuel, labor & time defaults">
        <div className="form-grid">
          <NumberField label="Diesel price" prefix="$" suffix="/gal" value={s.dieselPrice} onChange={(v) => set({ dieselPrice: v ?? 0 })} />
          <NumberField label="DEF price" prefix="$" suffix="/gal" value={s.defPricePerGallon} onChange={(v) => set({ defPricePerGallon: v ?? 0 })} />
          <NumberField label="DEF consumption" suffix="% of diesel" value={s.defPctOfDiesel} onChange={(v) => set({ defPctOfDiesel: v ?? 0 })} hint="0 for gas trucks" />
          <NumberField label="Your target hourly rate" prefix="$" suffix="/h" value={s.targetHourlyRate} onChange={(v) => set({ targetHourlyRate: v ?? 0 })} />
          <NumberField label="Avg driving speed" suffix="mph" value={s.avgSpeedMph} onChange={(v) => set({ avgSpeedMph: v ?? 0 })} />
          <NumberField label="Load/unload time per stop" suffix="h" value={s.hoursPerStop} onChange={(v) => set({ hoursPerStop: v ?? 0 })} />
          <NumberField label="Time per fuel stop" suffix="h" value={s.fuelStopHours} onChange={(v) => set({ fuelStopHours: v ?? 0 })} />
          <NumberField label="Inspection per load" suffix="h" value={s.inspectionHoursPerLoad} onChange={(v) => set({ inspectionHoursPerLoad: v ?? 0 })} />
          <TextField
            label="Fuel sensitivity prices"
            value={s.fuelSensitivityPrices.join(', ')}
            onChange={(v) =>
              set({ fuelSensitivityPrices: v.split(',').map((x) => parseFloat(x)).filter((x) => Number.isFinite(x) && x > 0) })
            }
          />
        </div>
      </Card>

      <Card title={`Monthly fixed costs · ${money(fixedTotal)}`}>
        <div className="form-grid">
          {(Object.keys(BUSINESS_FIXED_LABELS) as (keyof Settings['businessFixed'])[]).map((k) => (
            <NumberField
              key={k}
              label={BUSINESS_FIXED_LABELS[k]}
              prefix="$"
              value={s.businessFixed[k]}
              onChange={(v) => set({ businessFixed: { ...s.businessFixed, [k]: v ?? 0 } })}
            />
          ))}
        </div>
        <p className="note">
          + equipment “{activeProfile.name}”: truck payment {money(activeProfile.truck.monthlyPayment)}, truck insurance {money(activeProfile.truck.monthlyInsurance)}, trailer payment{' '}
          {money(activeProfile.trailer.monthlyPayment)}, trailer insurance {money(activeProfile.trailer.monthlyInsurance)} (edit in Equipment).
        </p>
        <h3>Allocate to loads</h3>
        <Segmented
          label="Allocation method"
          value={al.method}
          onChange={(v) => set({ allocation: { ...al, method: v } })}
          options={[
            { value: 'perMile', label: 'Per mile' },
            { value: 'perDay', label: 'Per working day' },
            { value: 'perLoad', label: 'Per load' },
          ]}
        />
        <div className="form-grid">
          <NumberField label="Expected monthly miles" value={al.expectedMonthlyMiles} integer onChange={(v) => set({ allocation: { ...al, expectedMonthlyMiles: v ?? 0 } })}
            hint={`${rate3(al.expectedMonthlyMiles ? fixedTotal / al.expectedMonthlyMiles : 0)}/mi`} />
          <NumberField label="Working days / month" value={al.workingDaysPerMonth} onChange={(v) => set({ allocation: { ...al, workingDaysPerMonth: v ?? 0 } })}
            hint={`${cents(al.workingDaysPerMonth ? fixedTotal / al.workingDaysPerMonth : 0)}/day`} />
          <NumberField label="Expected loads / month" value={al.expectedLoadsPerMonth} integer onChange={(v) => set({ allocation: { ...al, expectedLoadsPerMonth: v ?? 0 } })}
            hint={`${cents(al.expectedLoadsPerMonth ? fixedTotal / al.expectedLoadsPerMonth : 0)}/load`} />
          <NumberField label="Work hours / day" value={al.workHoursPerDay} onChange={(v) => set({ allocation: { ...al, workHoursPerDay: v ?? 0 } })} hint="converts hours → days" />
        </div>
      </Card>

      <Card title="Targets">
        <div className="form-grid">
          {(
            [
              ['monthlyGross', 'Monthly gross', '$'],
              ['monthlyProfit', 'Monthly economic profit', '$'],
              ['weeklyGross', 'Weekly gross', '$'],
              ['weeklyProfit', 'Weekly economic profit', '$'],
              ['profitPerMile', 'Profit / mile', '$'],
              ['profitPerHour', 'Profit / hour', '$'],
            ] as const
          ).map(([k, label, prefix]) => (
            <NumberField key={k} label={label} prefix={prefix} value={s.targets[k]} onChange={(v) => set({ targets: { ...s.targets, [k]: v ?? 0 } })} />
          ))}
        </div>
      </Card>

      <Card title="Minimum rate & negotiation">
        <Segmented
          label="Target profit mode"
          value={s.targetProfit.mode}
          onChange={(v) => set({ targetProfit: { ...s.targetProfit, mode: v } })}
          options={[
            { value: 'perMile', label: 'Per mile' },
            { value: 'perLoad', label: 'Per load' },
          ]}
        />
        <div className="form-grid">
          {s.targetProfit.mode === 'perMile' ? (
            <NumberField label="Target profit per total mile" prefix="$" value={s.targetProfit.perMile} onChange={(v) => set({ targetProfit: { ...s.targetProfit, perMile: v ?? 0 } })} />
          ) : (
            <NumberField label="Target profit per load" prefix="$" value={s.targetProfit.perLoad} onChange={(v) => set({ targetProfit: { ...s.targetProfit, perLoad: v ?? 0 } })} />
          )}
          <NumberField label="Negotiation room" suffix="%" value={s.negotiationBufferPct} onChange={(v) => set({ negotiationBufferPct: v ?? 0 })} hint="ask = minimum × (1 + room)" />
          <NumberField label="Max gap still negotiable" suffix="%" value={s.maxNegotiationGapPct} onChange={(v) => set({ maxNegotiationGapPct: v ?? 0 })} hint="beyond → REJECT" />
          <NumberField label="Round rates up to" prefix="$" value={s.roundRatesTo} onChange={(v) => set({ roundRatesTo: v ?? 0 })} />
          <NumberField label="Factoring fee" suffix="%" value={s.factoringPct} onChange={(v) => set({ factoringPct: v ?? 0 })} />
          <NumberField label="Effective tax rate" suffix="%" value={s.taxRatePct} onChange={(v) => set({ taxRatePct: v ?? 0 })} hint="estimate only — not tax advice" />
        </div>
      </Card>

      <Card title="Load score">
        <Accordion title="Factors, weights & thresholds">
          <p className="note">Each factor gives 0 points at “bad” and 100 points at “good” (linear in between), then a weighted average. Weight 0 disables a factor.</p>
          <div className="score-settings">
            {(Object.keys(SCORE_LABELS) as (keyof typeof SCORE_LABELS)[]).map((k) => (
              <div key={k} className="score-row">
                <span className="score-row-label">{SCORE_LABELS[k][0]}</span>
                <NumberField label="Weight" value={s.scoring[k].weight} onChange={(v) => set({ scoring: { ...s.scoring, [k]: { ...s.scoring[k], weight: v ?? 0 } } })} />
                <NumberField label={`Bad ${SCORE_LABELS[k][1]}`} allowNegative value={s.scoring[k].bad} onChange={(v) => set({ scoring: { ...s.scoring, [k]: { ...s.scoring[k], bad: v ?? 0 } } })} />
                <NumberField label={`Good ${SCORE_LABELS[k][1]}`} allowNegative value={s.scoring[k].good} onChange={(v) => set({ scoring: { ...s.scoring, [k]: { ...s.scoring[k], good: v ?? 0 } } })} />
              </div>
            ))}
            <div className="score-row">
              <span className="score-row-label">Trip length fit (miles)</span>
              <NumberField label="Weight" value={s.scoring.tripLength.weight} onChange={(v) => set({ scoring: { ...s.scoring, tripLength: { ...s.scoring.tripLength, weight: v ?? 0 } } })} />
              <NumberField label="Preferred min" value={s.scoring.tripLength.preferredMin} onChange={(v) => set({ scoring: { ...s.scoring, tripLength: { ...s.scoring.tripLength, preferredMin: v ?? 0 } } })} />
              <NumberField label="Preferred max" value={s.scoring.tripLength.preferredMax} onChange={(v) => set({ scoring: { ...s.scoring, tripLength: { ...s.scoring.tripLength, preferredMax: v ?? 0 } } })} />
            </div>
          </div>
        </Accordion>
        <Accordion title="Warning thresholds (auto risks)">
          <div className="form-grid">
            {(Object.keys(WARN_KEY) as (keyof WarningThresholds)[]).map((k) => (
              <NumberField key={k} label={AUTO_RISK_LABELS[WARN_KEY[k]]} value={s.warnings[k]} onChange={(v) => set({ warnings: { ...s.warnings, [k]: v ?? 0 } })}
                suffix={k === 'stops' ? 'stops' : k === 'waitingHours' ? 'h' : '%'} />
            ))}
          </div>
        </Accordion>
        <Accordion title="Manual risk penalties (points)">
          <div className="form-grid">
            {MANUAL_RISKS.map((m) => (
              <NumberField key={m.key} label={m.label} value={s.riskPenalties[m.key]} onChange={(v) => set({ riskPenalties: { ...s.riskPenalties, [m.key]: v ?? 0 } })} />
            ))}
          </div>
        </Accordion>
      </Card>

      <DataTools />

      <Card title="Reset">
        <button
          className="btn danger outline"
          onClick={() => confirm('Reset all settings to defaults? Loads and equipment are kept.') && updateSettings(() => ({ ...DEFAULT_SETTINGS, activeProfileId: s.activeProfileId }))}
        >
          Reset settings to defaults
        </button>
      </Card>
    </div>
  );
}

function Profiles() {
  const { data, updateSettings, upsertProfile, deleteProfile } = useStore();
  const [editing, setEditing] = useState(data.settings.activeProfileId);
  const p = data.profiles.find((x) => x.id === editing) ?? data.profiles[0];
  const up = (patch: Partial<EquipmentProfile>) => upsertProfile({ ...p, ...patch });
  const truck = (patch: Partial<EquipmentProfile['truck']>) => up({ truck: { ...p.truck, ...patch } });
  const trailer = (patch: Partial<EquipmentProfile['trailer']>) => up({ trailer: { ...p.trailer, ...patch } });
  const isActive = data.settings.activeProfileId === p.id;

  return (
    <Card
      title="Equipment (truck + trailer)"
      actions={
        <button
          className="btn ghost small"
          onClick={() => {
            const np = { ...structuredClone(DEFAULT_PROFILE), id: newId(), name: `Truck ${data.profiles.length + 1}` };
            upsertProfile(np);
            setEditing(np.id);
          }}
        >
          + Add
        </button>
      }
    >
      <div className="form-grid">
        <SelectField label="Profile" value={p.id} onChange={setEditing} options={data.profiles.map((x) => ({ value: x.id, label: `${x.name}${x.id === data.settings.activeProfileId ? ' (default)' : ''}` }))} />
        <TextField label="Profile name" value={p.name} onChange={(v) => up({ name: v })} />
      </div>
      <div className="btn-row">
        {!isActive && (
          <button className="btn small" onClick={() => updateSettings((s) => ({ ...s, activeProfileId: p.id }))}>
            Use for new loads
          </button>
        )}
        {data.profiles.length > 1 && (
          <button className="btn small ghost danger" onClick={() => confirm(`Delete ${p.name}?`) && (deleteProfile(p.id), setEditing(data.profiles.find((x) => x.id !== p.id)!.id))}>
            Delete profile
          </button>
        )}
        <span className="muted">Loaded MPG: <b>{profileLoadedMpg(p).toFixed(2)}</b></span>
      </div>

      <h3>Truck</h3>
      <div className="form-grid">
        <TextField label="Year" value={p.truck.year} onChange={(v) => truck({ year: v })} />
        <TextField label="Make" value={p.truck.make} onChange={(v) => truck({ make: v })} />
        <TextField label="Model" value={p.truck.model} onChange={(v) => truck({ model: v })} />
        <TextField label="Engine" value={p.truck.engine} onChange={(v) => truck({ engine: v })} />
        <NumberField label="MPG (no trailer)" value={p.truck.mpg} onChange={(v) => truck({ mpg: v ?? 0 })} />
        <NumberField label="Fuel tank" suffix="gal" value={p.truck.tankGallons} onChange={(v) => truck({ tankGallons: v ?? 0 })} />
        <NumberField label="Current mileage" value={p.truck.currentMileage} integer onChange={(v) => truck({ currentMileage: v ?? 0 })} />
        <NumberField label="Monthly payment" prefix="$" value={p.truck.monthlyPayment} onChange={(v) => truck({ monthlyPayment: v ?? 0 })} />
        <NumberField label="Insurance (physical damage)" prefix="$" suffix="/mo" value={p.truck.monthlyInsurance} onChange={(v) => truck({ monthlyInsurance: v ?? 0 })} />
        <NumberField label="Maintenance" prefix="$" suffix="/mi" value={p.truck.maintenancePerMile} onChange={(v) => truck({ maintenancePerMile: v ?? 0 })} />
        <NumberField label="Tires" prefix="$" suffix="/mi" value={p.truck.tirePerMile} onChange={(v) => truck({ tirePerMile: v ?? 0 })} />
      </div>

      <h3>Trailer</h3>
      <div className="form-grid">
        <TextField label="Type" value={p.trailer.type} onChange={(v) => trailer({ type: v })} />
        <NumberField label="Length" suffix="ft" value={p.trailer.lengthFt} onChange={(v) => trailer({ lengthFt: v ?? 0 })} />
        <NumberField label="GVWR" suffix="lbs" value={p.trailer.gvwr} integer onChange={(v) => trailer({ gvwr: v ?? 0 })} />
        <NumberField label="Empty weight" suffix="lbs" value={p.trailer.emptyWeight} integer onChange={(v) => trailer({ emptyWeight: v ?? 0 })} />
        <NumberField label="Typical max payload" suffix="lbs" value={p.trailer.typicalPayload} integer onChange={(v) => trailer({ typicalPayload: v ?? 0 })} />
        <NumberField label="MPG impact" suffix="%" value={p.trailer.mpgImpactPct} onChange={(v) => trailer({ mpgImpactPct: v ?? 0 })} hint="MPG drop when pulling" />
        <NumberField label="Monthly payment" prefix="$" value={p.trailer.monthlyPayment} onChange={(v) => trailer({ monthlyPayment: v ?? 0 })} />
        <NumberField label="Insurance" prefix="$" suffix="/mo" value={p.trailer.monthlyInsurance} onChange={(v) => trailer({ monthlyInsurance: v ?? 0 })} />
        <NumberField label="Maintenance" prefix="$" suffix="/mi" value={p.trailer.maintenancePerMile} onChange={(v) => trailer({ maintenancePerMile: v ?? 0 })} />
      </div>
    </Card>
  );
}
