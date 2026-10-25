# QIRLPL LIMS: MCP connector (plan; build on staging started 25 Oct 2026)

| | |
|---|---|
| Version | 0.4 (25 Oct 2026): Grok Bot allowed (section 9); 0.3: lab decisions of 25 Oct (section 7) |
| Asked by | Amit, 24 Oct: use the in-app AI less and an MCP connector more |
| Clause | ISO/IEC 17025:2017 4.2 (confidentiality), 7.11 (LIMS), 8.4 |
| Not part of | The go-live of 25 Oct. The connector is a separate service; it is built and validated on staging after go-live, then released as its own software change |

## 1. What it is

An MCP (Model Context Protocol) server for the LIMS. Staff add it once as a
custom connector in Claude (claude.ai, Claude desktop, Claude Code) and sign
in with their **own LIMS login**. Claude can then look things up in the LIMS
for them ("which samples are due this week", "is QI-EQ-0021 calibrated",
"open NCs for the mechanical section") instead of the in-app QI Assistant.

## 2. Design

| Item | Decision |
|---|---|
| Service | New Railway service `mcp` (Node, official MCP TypeScript SDK, Streamable HTTP transport), address `https://mcp.qirlpl.com/mcp` |
| Sign-in | OAuth 2.1 as Claude's custom connectors require: the `mcp` service shows the LIMS sign-in (email + password checked by our GoTrue), then gives Claude a token tied to that user. Tokens expire (8 h, as the app); signing out in the LIMS or deactivating the user ends them |
| Data access | Every tool calls PostgREST **as the signed-in user**, so row level security, module access and all database guards apply exactly as in the app. The service never uses the service-role key for data |
| Writes | Phase 1: none. Phase 2: a few low-risk entries only (an environment reading, a draft note), each asking the user to confirm in Claude and each in the audit trail with "via MCP". Issuing reports or certificates, changing results, deleting: **never** through MCP |
| Confidentiality (4.2) | Data a tool returns goes to Claude (Anthropic). So the connector follows the same AI data guard as the QI Assistant: it works only when Lab Settings → AI allows client data for MCP; client names and addresses are replaced unless the client has consented (same redaction code); the Director can switch MCP off for everyone |
| Record | Every MCP call is logged (`mcp_calls`: user, tool, arguments, rows returned, time); the QM can read it |
| Abuse limits | Per-user rate limit; results capped (50 rows); no free SQL |

## 3. Tools (phase 1, read only)

| Tool | Answers | Who can use (by their own access) |
|---|---|---|
| `search_samples` | SRF, client, IS code, stage, dates | Sample Cell, TM, QM, Director |
| `sample_status` | One SRF: stage, tests, who, due date, report number | Same |
| `my_work` | Tests allocated to me, results to enter or review | Engineers, TM |
| `due_and_overdue` | Samples and reports past or near their due date | TM, QM, Director |
| `issued_reports` | Issued reports by date, client, ULR (no file contents) | QM, Director |
| `equipment_status` | Equipment, calibration due date, status, overdue list | All staff |
| `open_ncs_and_complaints` | Open nonconforming work, CAPA, complaints | QM, Director |
| `audit_trail_search` | Who changed a record and when (no full row values) | QM, Director |
| `lab_summary` | Counts for the dashboard (samples by stage, reports this month) | QM, Director |

## 4. Validation (before release)

| Item | Plan |
|---|---|
| Requirements | Add URS-MCP-01…05 (own login only; same access as the app; no writes in phase 1; AI data guard applies; every call logged) |
| Risk | New function F-20 "MCP connector": S 2 (confidentiality), L 2 → Medium. Controls above |
| Tests (OQ-08) | Each role signs in through Claude on staging; each tool answers within that role's access; an engineer cannot read the audit trail through MCP; a client without consent is redacted; MCP switched off refuses; calls appear in the log |
| Release | Software change record, validation run on staging, QM review, then production |

## 5. Work and order

| # | Step | Where | Approval |
|---|---|---|---|
| 1 | Migration: `mcp_calls` log table, MCP switch in AI settings | Branch | Plan approval |
| 2 | `backend/mcp-server/`: OAuth, the 9 read tools, logging, redaction | Branch | — |
| 3 | Railway service `mcp` on **staging**, test with each role from Claude (OQ-08) | Staging | Yes |
| 4 | Validation run, QM review | — | QM |
| 5 | Production service and `mcp.qirlpl.com` (DNS record at the domain host) | Production | Yes |
| 6 | Staff guide: how to add the connector in Claude | Docs | — |

Estimate: steps 1–3 about one working session; after the go-live, when the
weekly usage limit allows.

## 6. Lab decisions (24 Oct 2026)

| # | Question | Decision |
|---|---|---|
| 1 | Client data through the connector | **Always redacted**: client names and addresses are replaced in every answer, whatever the client's consent |
| 2 | Who may use it first | **QM, Technical Managers and the Laboratory Director** only; other staff are refused at sign-in |
| 3 | Phase 2 writes | **Not now**: the connector stays read-only |

Effect on the design: the redaction is not switchable for MCP (no consent
exception); the `mcp` service checks the designation at sign-in and on every
call; the tool list in section 3 drops `my_work` for engineers (it stays for
TMs). OQ-08 tests that an engineer and Sample Cell user are refused and that a
consenting client is still redacted.

## 7. Lab decisions (25 Oct 2026, replace section 6 where they differ)

| # | Question | Decision |
|---|---|---|
| 1 | Who may sign in | **Laboratory Director, Quality Manager and Technical Manager** only (unchanged); everyone else is refused at sign-in and on every call |
| 2 | Same access as the app | **Must hold**: every tool calls the database as the signed-in user, so row level security and the database guards apply; the connector also checks the user's Module Access level for every table it reads or writes, whatever the database enforcement mode (it is in `log` for two weeks) |
| 3 | Writes | **Laboratory Director only**: view and edit everything the Director can edit in the app, **except** (a) submitting results (Samples Under Testing → Enter Results), (b) any delete or soft delete, (c) issuing or signing a test report or calibration certificate, or approving results for one. QM and TM: read only |
| 4 | Client name and address | **Laboratory Director only** sees them. For QM and TM they are always replaced (client name, contact person, address, PIN, e-mail, phone, GSTIN, PAN), whatever the client's consent |
| 5 | Switch | Lab Settings → AI: "MCP connector" on/off, changed by the Director; off refuses sign-in and every call. Default off |

Effect on the design (replaces the "Writes" and "Confidentiality" rows of
section 2 for the connector):

- Data the Director's answers carry goes to Anthropic unredacted: this is the
  lab's decision of 25 Oct 2026 (risk F-20 accepted by the Director); QM and TM
  answers stay redacted.
- Write tools (`create_record`, `update_record`) appear only for the Director.
  Each write is one row, shows the old and new values, is marked
  `reason = 'via MCP'` in the Audit Trail and is logged in `mcp_calls`. There is
  no delete tool; columns for delete, issue, signature and result submission
  are refused; tables whose rows the app numbers or signs (SRF, test reports,
  certificates, invoices) cannot be created through MCP.
- Tools: `whoami`, `list_tables`, `describe_table`, `query_table` (filters, no
  free SQL, 50 rows at most), `search_samples`, `sample_status`,
  `due_and_overdue`, `equipment_status`, `open_ncs_and_complaints`,
  `issued_reports`, `audit_trail_search`, `lab_summary`, `my_work`; plus the
  Director's `create_record` and `update_record`.
- OQ-08 adds: the Director can edit a master record and the change shows "via
  MCP" in the Audit Trail; the Director cannot submit a result, delete, or issue;
  QM and TM have no write tools and see placeholders for client name and address.

## 8. Status (25 Oct 2026)

Steps 1–3 of section 5 are done on staging: migration 52
`20261102101400_mcp_connector.sql` (staging database only), `backend/mcp-server/`,
service `mcp` on staging, AI Settings switch. OQ-08:
`docs/lims-validation/OQ-08-mcp-connector.md` (45 of 45 pass after the GoTrue
v2.196.0 and gateway client-IP fix on staging; both still to be done in
production). Staff guide:
`docs/mcp-connector-staff-guide.md`. Production: nothing applied.

## 9. Lab decision: Grok Bot (25 Oct 2026)

Amit (Laboratory Director) chose option C in chat: **Grok Bot** (xAI's Grok,
which appears to run on Cursor/Anysphere's agent platform: it registered as
"Cursor" and the Cursor forum lists its callbacks) may use the connector with
the **same access as Claude**: the Director sees client names and addresses
and can change records; QM and TM stay redacted and read only; the same
refusals apply (results, issue/sign, delete).

Consequences accepted by the Director, to be closed by the QM:

| # | Item | Owner |
|---|---|---|
| 1 | Risk F-20 updated: client data (for the Director unredacted) goes to xAI and possibly Cursor/Anysphere, outside India (ISO/IEC 17025 4.2; DPDP Act 2023 for contact persons' names, phones, e-mails) | QM |
| 2 | Check xAI and Cursor terms for the lab's plan: data retention, use for model training (opt-out), where data is stored | Director |
| 3 | Client agreements and the confidentiality statement: say that AI assistants from named providers may process the lab's records | QM |
| 4 | The connector allows the callback addresses Grok Bot uses (`MCP_REDIRECT_ALLOW` on the `mcp` service): Cursor's published callbacks `https://www.cursor.com/agents/mcp/oauth/callback` and `cursor://anysphere.cursor-mcp/oauth/callback`, and any other address only after it is seen in the connector log | Developer |

Status 25 Oct 2026 (afternoon): Grok Bot connected in production at 13:29 IST
after the sign-in page fixes (PRs #11–#15). Items 1 and 3 are drafted for the
QM: risk F-20 in `risk-assessment.md` v1.1 and the clause in
`lims-validation/client-ai-clause.md`; item 2 is the Director's (Cursor Privacy
Mode, Grok Data Controls). QM review with the open conditions:
`lims-validation/QM-review-OQ-08.md`.
