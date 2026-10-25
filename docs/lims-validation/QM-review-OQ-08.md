# QM review: OQ-08 MCP connector (25 Oct 2026)

| | |
|---|---|
| Change | MCP connector for AI assistants (plan `docs/mcp-connector-plan.md` v0.4) |
| Records reviewed | `OQ-08-mcp-connector.md`, `go-live-runbook.md` (releases 2 and 3), `risk-assessment.md` v1.1 (F-20), `URS.md` section 7a |
| Checks run by | Claude (development), on the Director's instruction of 25 Oct 2026 to run the QM checks and report pass or fail; the QM signs below |
| Result | **PASS with conditions** (section 3) |

## 1. Requirement → evidence

| Requirement | Evidence (OQ-08 ids) | Result |
|---|---|---|
| URS-MCP-01 own login; Director, QM, TM only | M-03 (Testing Engineer, Sample Incharge, Auditor, Calibration Engineer refused), M-04 (wrong password), M-05 (three roles sign in), M-06 | Pass |
| URS-MCP-02 same access as the app | M-11 (TM refused a table outside Module Access), M-10 (TM refused the Audit Trail, QM allowed), M-19 (TM cannot read the call log); every call runs with the user's own token | Pass |
| URS-MCP-03 writes Director only; no results, issue/sign, delete | M-05 (no write tools for QM/TM), M-12 (result entry and approval refused), M-13 (stage, issue, signature, ULR, delete refused), M-14 (no SRF creation, issued report frozen, no delete tool), M-16 | Pass |
| URS-MCP-04 client name and address replaced for QM and TM | M-07, M-08 (placeholders for name, address, mobile, e-mail, GSTIN; no real name anywhere in the answer), M-09 (search by placeholder) | Pass |
| URS-MCP-05 every call logged; changes "via MCP" | M-15 (change and change back shown "via MCP" with the Director as actor), M-19 | Pass |
| URS-MCP-06 Director's switch | M-20 (off refuses sign-in; QM cannot switch it on) | Pass |
| Sign-in and token handling | M-01, M-02 (foreign redirect refused), M-17 (refresh and rotation), M-18 (revoke) | Pass |

Run: staging, 25 Oct 2026, 45 of 45 checks pass (after the GoTrue v2.196.0
fix); automated script `e2e.mjs`; OQ test accounts.

## 2. Production state (checked 25 Oct 2026, 13:55 IST, read only)

| Check | Found | Result |
|---|---|---|
| Migration 52 applied; `mcp_*` tables with RLS; no anon write grants | Yes (release 3 checks) | Pass |
| GoTrue version / auth schema | `v2.196.0` / `20260625000000` (refresh works: `token_refreshed` 10:14 IST) | Pass |
| Connector switch | On (Director) | As decided |
| Sessions | 1 live (Grok Bot, Director's login, connected 13:29 IST) | — |
| Call log | 11 sign-ins ok, 4 refused; no tool calls yet | Pass (log works) |
| Audit Trail "via MCP" rows in production | 0 (no change made through the connector yet) | Not yet exercised in production |
| Callback addresses allowed | Claude (2), Cursor `https://www.cursor.com/agents/mcp/oauth/callback`, `cursor://anysphere.cursor-mcp/oauth/callback`; others refused | Pass |
| Sign-in pages | No "Claude"-only wording; after sign-in the page moves on to the app (fix of 25 Oct for Grok Bot) | Pass |

## 3. Conditions (to close by 1 Nov 2026)

| # | Condition | Owner | Status |
|---|---|---|---|
| 1 | **Debugger in production.** At 12:15:59 IST a Node debugger was attached inside the production `mcp` container. Not this session, not Grok Bot (asked). The Railway account has one SSH key "cursor-migrate" (Cursor has had Railway access for about 5 months) besides this project's "qirlpl-dryrun-mac". Ask in Cursor whether an agent ran `railway ssh` then; remove the "cursor-migrate" key and Cursor's Railway login if no longer needed; then change `MCP_ENC_KEY` (the Director's go-ahead is needed; Grok Bot connects again once) | Director | **Open** |
| 2 | Cursor: Settings → Privacy Mode **On** (no retention, no training by Cursor or its model providers) | Director | Open |
| 3 | Grok / xAI: Data Controls → "Improve the model" **Off** | Director | Open |
| 4 | Client agreement / confidentiality statement: add the AI clause (`client-ai-clause.md`) and issue it with the next quotations and the website terms | QM | Open |
| 5 | Exercise one read and one small change through the connector in production; check the Audit Trail shows "via MCP" | Director | Open |

## 4. Approval

| Role | Name | Signature | Date |
|---|---|---|---|
| Quality Manager | | | |
| Laboratory Director | | | |
