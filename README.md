# Menon Lab Inventory

Shared reagent inventory + usage logging for the Menon Laboratory. One synced database, one link, installable on every phone. Preloaded with the current inventory (771 items across 10 rooms), the 21-person roster, projects, and program-director permissions.

## What it does
- **Log** — anyone picks their name, searches a reagent, logs what they used against an experiment. Stock auto-decrements.
- **Inventory** — browse/search everything by category and location (room / fridge / box). Program directors + full-access staff can add/edit/delete; everyone else is view + log only.
- **Reports** — weekly usage, per person, exportable to Excel (flat or one tab per member). This is your weekend view.
- **Manage** — program directors manage members, projects, and categories.
- Live sync: every phone refetches every 25s and on focus, so edits show up everywhere. Installable to the home screen (PWA).

## Deploy to Vercel (~10 min, one time)

1. **Put this folder on GitHub.** Create a new empty repo, then from this folder:
   ```bash
   git init && git add . && git commit -m "Menon Lab Inventory"
   git branch -M main
   git remote add origin https://github.com/<you>/menon-lab-inventory.git
   git push -u origin main
   ```
2. **Import to Vercel.** vercel.com → Add New → Project → pick the repo → Deploy.
3. **Add a database.** In the project: **Storage → Create → Postgres** (Vercel's Neon Postgres). Connect it to the project. This auto-sets the `POSTGRES_URL` environment variable.
4. **Redeploy.** Deployments → ⋯ → Redeploy (so it picks up the new env var).
5. **Open the URL.** First load creates the tables and seeds all 771 items + the roster automatically. Done.

Share that URL with the lab. On an iPhone: open in Safari → Share → **Add to Home Screen**. On Android: Chrome → menu → **Install app**. It then behaves like an installed app.

## The weekend view
- Open the app → **Reports** tab → it defaults to this week, broken down by person. Export with **By member**.
- Or bookmark the direct download: `https://<your-app>.vercel.app/api/weekly` returns this week's Excel (add `?date=YYYY-MM-DD` for any other week).

## Roles
- **Program directors** (Amabebe, Kammala, Richardson, Tantengco) and **full access** (Flores Espinosa / Pilar, Rheanna) can edit everything.
- Everyone else can log usage and view — no edits.
- Access follows the name each person selects under "Your identity." This is honor-system identity (fine for a single trusted lab). If you later want enforced UTMB logins, that's an Azure AD / NextAuth add-on.

## Optional: auto-email the weekend report
Add a mail provider (e.g. Resend) and a Vercel Cron job hitting a small route every Saturday that pulls `/api/weekly` and emails it to the PDs. Ask and I'll wire it up.

## Local development
```bash
npm install
# paste a Postgres URL into .env (see .env.example)
npm run dev
```

## Stack
Next.js 14 (App Router) · Postgres (`pg`) · lucide-react · SheetJS (xlsx). Data model: `members`, `categories`, `projects`, `items`, `usage_log`.

## Ordering & approvals (v2)
Full purchase workflow, following the lab's chain:

**Request → Cross-check → Authorize → PI approval + fund check → Megan orders → Received → Inventory**

- **Anyone** taps **Orders → Request**: item, cat #, vendor, qty, unit price, project, grant, and a required **reason** (experiment / justification). If the item looks like it's already in the lab, it flags a duplicate and makes them confirm before proceeding.
- **Authorizers** (full-access staff — Rheanna, Pilar — plus PDs/PI) authorize or send back.
- **PI** (Dr. Menon) gives final approval and sees live **grant balance vs. order total** at that step.
- **Megan** (Purchasing role) sees only approved orders, places them (records a PO), then marks them received. Received items can drop straight into inventory.
- **Grants**: PI/PDs set budgets per grant; balances update automatically as orders are placed. Accountability by person and by grant.
- **Exports**: **For Megan** (everything ready to order) and **Monthly** (orders + spend by grant + spend by person).

New roles auto-added on first load after this update: **Menon, Ramkumar** (PI) and **Megan** (Purchasing). Set Megan's full name/email and grant budgets in the app.

### Updating an already-deployed app
Replace the files in your GitHub repo with this version (upload/commit). Vercel redeploys automatically. On the next load, the app creates the new `orders` and `grants` tables and adds the PI/Purchasing members — your existing inventory and logs are untouched.

## Instrument booking (v3)
A shared reservation calendar under the **Book** tab.

- Preloaded instruments: Ultracentrifuge New, Ultracentrifuge -2, Flow cytometer, Confocal Cytation, Keyence microscope, Hoods.
- **Anyone** can reserve time: pick instrument, date, start/end, and an optional purpose. Overlapping slots on the same instrument are blocked automatically, so no double-booking.
- Day view per instrument; people cancel their own bookings.
- **Full-access staff (Rheanna, Pilar) and PDs/PI** can add, rename, or remove instruments via "Manage instruments."

Existing deployments: replace the repo files and redeploy — the `instruments` and `bookings` tables plus the 6 instruments are created automatically on next load.

## Ordering chain — updated
The approval flow now runs:

**Member request → Rheanna reviews & routes → Chair *or* a PD gives final approval → Rheanna places the order → Received**

- A student/member submits a request (with a required reason). It lands with **Rheanna** (full-access).
- Rheanna reviews and **routes it — her choice of the Chair (Dr. Ramkumar Menon) or a program director** — for final approval.
- **Final approval must come from the Chair or a program director.**
- Once approved, **Rheanna places the order** (and later marks it received).
- **Grants start empty** — the Chair and program directors add grant names and budgets themselves.
- Dr. Ramkumar Menon's role is **Chair** (final approver + fund owner).

## Alerts & the pre-order checklist (v4)

### Notification alerts
A bell in the header with an unread count. Alerts fire automatically:
- **A member submits a request → Rheanna & Pilar** (all full-access) are alerted: "New order request".
- **Rheanna routes it → the chosen approver** (Chair or PD) is alerted: "Approval needed". The requester is told where it went.
- **Approved → Rheanna & Pilar** alerted: "Approved — ready to order". Requester told it's approved.
- **Order placed → the requester and approver** alerted, with the PO if given.
- **Received → requester** alerted.
- **Sent back → requester** alerted, with the reason.

Tapping an alert jumps to the Orders tab. "Mark all read" clears the badge. Alerts are per-person and stored in the database, so they follow you to any device.

### Pre-order checklist (required)
Every request must confirm the options were explored before it can be submitted:
1. Searched the app's inventory for this item and similar names
2. Physically checked the likely fridge / freezer / shelf
3. Asked lab members or the project lead if they have it
4. Considered an equivalent already in the lab (other clone, vendor, or kit)
5. Considered whether an alternate approach avoids this purchase
6. Confirmed the size / quantity is what's actually needed
7. Compared vendor pricing / have a quote

The Send button stays disabled until all seven are ticked (live counter, e.g. 4/7). There's also a free-text **"What did you find?"** field. Reviewers see a green "Pre-order checklist completed (7/7)" badge and the explored notes on the order card — so Rheanna and the approvers can see the diligence before signing off. Checklist answers are stored with the order.

## Feedback fixes (v4.1 — from Pilar's review)

- **Edit or delete a usage entry.** Under "Your recent entries" in Log, each of your own entries now has edit (pencil) and delete (trash) buttons. Editing corrects the amount/unit/experiment/note; the stock count adjusts automatically to match. Deleting removes only that usage record and restores the stock.
- **Clear separation of "my usage" vs "the inventory item."** Deleting a usage entry never touches the inventory item. Deleting an inventory item now asks for confirmation and states plainly that it does not touch anyone's usage records.
- **Standardized units.** Amount fields now use a unit picker (aliquots, vial, tube, µL, µg, mg, mL, rxn, kit, bottle, plate, box, each) — type-ahead, but consistent. Antibodies default to "aliquots". You can still enter a custom unit if needed.
- **Incomplete items flagged.** Any item missing a vendor or catalog # shows an amber "needs info" tag, and a "Needs info (n)" filter chip appears in Inventory so the antibodies lacking details are easy to find and complete.
- **Editable projects.** Projects can now be renamed and reassigned to a different program director (pencil icon in Manage), not just added and deleted.
- **Edit or cancel an order you're placing.** While a request is still "requested," the requester (and full-access staff) can edit it, and can delete/cancel it. Full-access staff can cancel any order that hasn't been received.
