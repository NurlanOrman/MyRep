# Load Profit

Load profitability calculator for owner-operators running a pickup truck + trailer (hotshot).
For each broker offer it shows in seconds: gross, real cost, operating & economic profit,
profit per mile and per hour, break-even, minimum rate to accept, risks, a 0–100 load score
and a clear **TAKE / NEGOTIATE / REJECT** decision.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # calculation engine, analytics and storage tests
npm run build    # production build in dist/
```

Data is stored locally in the browser (localStorage). Use **Reports → Export** or
**Settings → Backup (JSON)** regularly.

On iPhone: open the site in Safari → Share → *Add to Home Screen*.

## How the numbers work

All formulas live in [`src/engine`](src/engine) and are documented in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Every default assumption is editable in Settings.

Key definitions:

- **Operating profit** = Gross − (fuel, DEF, maintenance/tire reserves, tolls, trip expenses, factoring, allocated fixed costs)
- **Economic profit** = Operating profit − your work hours × your target hourly rate
- **Minimum acceptable rate** = all costs + your labor + target profit
- Tax figures are an **estimate only — not tax advice**.
