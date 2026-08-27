# Bite 30G.3 — Settlement UX + Extension Workflow

## Objective

Present the Journey end-state as a direction-aware workflow built on the 30G.1 zero-balance invariant and the 30G.2 bidirectional final-settlement/receipt model.

## Settlement states

For each open Journey, BRL and Gold remain independent value units.

- A positive balance means the Tenant owes the Collaborator. The primary final-settlement action is **Settle Tenant Owed Balance**. The resulting final-settlement receipt is accepted in-app by the Collaborator.
- A negative balance means the Collaborator owes the Tenant. The Tenant Administrator chooses either **Extend Journey** or **Record Collaborator Payment**. The resulting repayment receipt is accepted in-app by a Tenant Administrator.
- A zero balance with outstanding final-settlement receipts remains not closable until the designated accepting party completes in-app acceptance.
- A Journey becomes closable only when every balance is zero and every other settlement blocker is cleared.

A Journey may simultaneously have a positive balance in one value unit and a negative balance in another. The UI presents both settlement directions independently; it does not net or convert BRL and Gold.

## Journey extension

`POST /api/v1/collaborators/:id/extend` accepts only:

```json
{
  "additionalDays": 14
}
```

The action:

1. requires the existing full Collaborator update authority (`collaborators.update`), which is held by the Tenant Administrator;
2. rejects non-positive additional days;
3. rejects a closed/finished Journey;
4. increments the Journey's cumulative `extension_days`;
5. recalculates `projected_end_date` from `default_end_date + cumulative extension_days`;
6. changes no payment, work-assignment, planning-availability, financial, receipt, Membership, Person, or Actor data.

The extension does not create a Ledger Entry and does not settle a debt. It only gives the open Journey additional time in which later earnings may reduce the amount owed to the Tenant.

The Collaborator self-service identity and `EARNINGS_OPERATOR` do not receive the full Collaborator-update permission and therefore cannot invoke the extension action.

## Receipt UX

Ledger-entry receipt summaries now carry the canonical 30G.2 receipt purpose, payment direction, accepting party, and acceptance timestamp. Current Account renders final-settlement receipts using the in-app acceptance lifecycle rather than legacy print/sign/return wording.

## Compatibility

Zero Gold and Partial Payout remain available as existing open-Journey operational payout actions. They are visually separated from the final Journey-settlement workflow and do not replace the direction-aware final settlement required before closure.
