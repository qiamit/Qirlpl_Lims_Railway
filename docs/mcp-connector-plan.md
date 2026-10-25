# QIRLPL LIMS: MCP connector (plan, not built)

| | |
|---|---|
| Version | 0.2 (24 Oct 2026): lab decisions recorded (section 6) |
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
