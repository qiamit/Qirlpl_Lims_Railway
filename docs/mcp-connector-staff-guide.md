# Using the QIRLPL LIMS from Claude (MCP connector)

For the Laboratory Director, the Quality Manager and Technical Managers.
Other staff cannot sign in to the connector.

## Add the connector (once)

1. In Claude (claude.ai, the Claude desktop app or Claude Code) open
   **Settings → Connectors → Add custom connector**.
2. Name: `QIRLPL LIMS`. Address: the one shown in the LIMS under
   **Settings → AI → General Setting → 04 MCP connector** (staging:
   `https://mcp-staging-9e9a.up.railway.app/mcp`).
3. Click **Connect**. A QIRLPL LIMS sign-in page opens. Sign in with **your own
   LIMS email and password**. Never use someone else's login.
4. Claude shows the connector as connected. The sign-in lasts at most 8 hours;
   after that, connect again.

## What you can do

| | Director | QM | TM |
|---|---|---|---|
| Ask about samples, SRF status, due and overdue work, equipment, NCs, complaints, issued reports, lab summary | Yes | Yes | Yes |
| Read any table your Module Access allows in the app | Yes | Yes | Yes |
| Audit Trail (who changed what, when) | Yes | Yes | No |
| Client names, contacts and addresses | Shown | Replaced (`CLIENT_3fa91c`) | Replaced |
| Change or add records | Yes, after Claude shows the change and you agree | No | No |

Never possible through the connector (use the app):

- submitting or approving results (Enter Results, Results Under Review);
- issuing or signing a test report or calibration certificate, report and ULR
  numbers, stage moves;
- deleting anything;
- registering a new SRF, allocations, jobs, quotations, invoices, consent
  letters.

## Good practice

- Check what Claude proposes before you approve a change. Every change shows
  "via MCP" in the Audit Trail with your name, and every call is in the MCP
  call log (QM and Director can read it).
- A placeholder such as `CLIENT_3fa91c` is always the same client; you can ask
  Claude to search with it.
- The Director can switch the connector off for everyone in AI Settings.
