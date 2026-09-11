# Khazana for Teams — the hybrid model

Written 4 September 2026, after a hospital group asked whether Khazana could
track their employees' expenses. **Nothing here is built.** This is the design
to argue about before writing code, and the scoping language to put in front of
the client before they trial anything.

Status: consumer launch stays the priority. This is a side bet, deliberately.

---

## 1. The collision, stated plainly

Khazana's defining constraint is that there is no server and data never leaves
the device. That is exactly what an employer needs it *not* to do. A finance
team cannot approve, audit or retain something it cannot see.

It is not a feature gap. Three of the requirements are the inverse of the
architecture:

| The employer needs | Khazana today |
|---|---|
| To see every employee's claims | Impossible — no server, by design |
| An audit trail of who changed what | `types.ts` says outright: *"Not an audit trail — the previous values are gone."* |
| To retain records after an employee leaves | The employee owns the data and can erase it |

Everything else on their list — cost centres, per-diem, GST capture, mileage,
approval status — is ordinary product work. These three are not.

## 2. The hybrid, in one sentence

**The personal vault never syncs. A claim does.**

The employee's vault stays exactly as it is: encrypted on device, no server, no
telemetry, no recovery. A *claim* is an explicit, user-initiated act — the
employee selects expenses, attaches receipts, and submits. Only what they submit
crosses the boundary.

The pitch this earns is one no competitor can make:

> Your personal spending stays yours. Only what you claim is shared.

### What crosses the boundary

| Crosses | Never crosses |
|---|---|
| Claim line items the employee selected | The vault, or the vault key |
| Receipt images attached to those lines | Any expense not on a claim |
| Submitter identity, timestamps | Salary, savings, portfolio, net worth |
| Approval and payment events | Categories and budgets outside the claim |

### Why a claim is a copy, not a view

Once submitted, the claim is an **immutable record owned by the company**, not a
window onto the employee's vault. This falls out of the boundary rule and solves
three problems at once:

- The employee can still "erase all data" without destroying records the company
  is legally required to retain.
- Editing a transaction later cannot retroactively alter an approved claim.
- The server never needs the vault key, so it cannot read anything else.

## 3. The audit-trail contradiction, resolved

The local vault keeps its current property: no audit trail, previous values
gone. The **claim** carries the audit trail, server-side, because it is the only
thing anyone else has a right to audit.

This is the cleanest available answer. The employee's own history stays their
business; the money they ask the company to pay is fully accountable.

## 4. Keeping the consumer promise intact

This is the biggest risk in the whole idea, bigger than any engineering problem.

**If "Khazana has no server" stops being true, the consumer product loses the
one claim the entire brand rests on.** The store listing, the landing page, the
case study and the threat model all lead with it.

So: **the consumer build must contain no networking code for claims at all** —
not disabled, not behind a flag that ships, absent.

The codebase already has the mechanism. `kUsesStoreBilling` is selected by
`--dart-define=KHAZANA_CHANNEL=play|appStore`, evaluated with
`bool.fromEnvironment`, so a build without the flag does not contain the branch.
A `teams` channel reuses a pattern that is already proven and already asserted in
the release checklist:

```
--dart-define=KHAZANA_CHANNEL=teams     # the only build that can submit a claim
```

Add an assertion to the release checklist alongside the existing dev-override
grep: the consumer artifact must contain no claim-submission symbols and no
server hostname.

## 5. Data model additions

Both clients, in step, driven by shared fixtures like every other cross-client
contract in this project (`docs/pro-gates.json`, `test/fixtures/health_cases.json`).

**On a transaction** — useful to consumers on their own, see §7:
- `costCentre` / `projectId`, or a general tag dimension. Neither exists today;
  a transaction currently carries only `categoryId`, `merchant` and `note`.

**New, teams channel only:**
- `Claim` — id, submitter, period, status, totals, submitted/approved timestamps
- `ClaimLine` — links a transaction snapshot to a claim (a *copy*, per §2)
- Status: `draft → submitted → approved | rejected → paid`

There is no status, claim or approval concept anywhere in either client today.

## 6. What the server must and must not be

Minimal, and honest about being a different security model:

- Stores claims, receipts, approvals, and organisation membership. **Encrypted at
  rest, but not zero-knowledge** — the employer must be able to read what it is
  being asked to pay for. Say this plainly; do not imply otherwise.
- **Never** holds a vault key, and has no path to any unclaimed data.
- Needs the things a hospital's IT review will ask for: SSO, role-based access,
  audit logging, data residency in India, retention and deletion policy, and an
  answer on DPDP Act obligations with the company as data fiduciary.

That review, not the feature list, is the likely deciding factor. Ask them for
their security requirements early — it may end the conversation cheaply, which
is a good outcome if it is going to end.

## 7. The no-regrets overlap

Some of this improves the consumer product regardless of whether the client
signs, so it is safe to build first:

- **Tags / cost centres** — the `business` ProfileKind already exists
  (`self | spouse | business`), so a freelancer separating business spend is an
  existing, unserved consumer story.
- **Expense-report bundles** — group N expenses into one total with receipts.
  Useful to anyone claiming reimbursement from anyone, employed or not.
- **Mileage and per-diem**, **GST fields on a receipt**, **receipt OCR**.

Build these in the consumer app. They stand on their own, and they are the
prerequisites for claims if the bet pays off.

## 8. What to tell the client before they trial it

Set this expectation now. If they evaluate a personal-finance app expecting
manager visibility, the trial fails in two days for a reason that has nothing to
do with quality.

> Today Khazana is a personal finance app. An employee can track expenses,
> attach receipts and export a report — but the data stays on their device, so
> there is no manager view, no approval workflow and no central record. That is
> deliberate, and it is what the hybrid model above would add. Please evaluate
> the capture and reporting experience; the workflow around it is the thing we
> would build next, and I would rather scope it with you than guess.

## 9. Sequence

Consumer launch is unchanged and stays first. This runs behind it:

1. Get the client's 18 comments and their security requirements. Map each item
   to: exists / cheap / blocked by architecture.
2. Build the §7 no-regrets features in the consumer app.
3. Only then, if the client is still interested and the security bar is
   reachable, design the claim boundary and the server for real.

Do not start step 3 before step 1. The 18 comments may reprice the whole idea.

## 10. Open questions

- How many employees, and does approval need more than one level?
- Do they reimburse against a corporate card, or out of pocket?
- Is this on hospital-issued devices or personal phones? Personal phones make it
  a BYOD policy question before it is a software question.
- Do they need GST input-credit capture? That changes the receipt model.
- What is their security review bar, and who signs it off?
