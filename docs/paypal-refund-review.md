# PayPal refund / reversal review

How to find and resolve PayPal refund, reversal (chargeback) and cancellation
cases that the webhook (`app/api/paypal/webhook/route.ts`) could not finish on
its own. Policy and rules: `app/lib/paypalRefunds.ts`.

## What the webhook does on its own

| Situation | Automatic result |
|---|---|
| Confirmed full refund or reversal | Premium revoked now, PayPal subscription cancelled |
| Partial refund | Premium and subscription kept |
| Refund not yet confirmed by PayPal, or a PayPal/Supabase call failed or timed out | Recorded as `needs_review`; webhook answers 500 so PayPal redelivers |
| Access revoked but PayPal has not confirmed the cancellation | Recorded with `paypal_cancellation = 'pending'`; webhook answers 500 so PayPal redelivers (each retry checks PayPal first, so no double cancel) |
| Renewal charged on a subscription whose access was already revoked | Premium is **not** re-granted; the subscription is cancelled again and the payment is noted on the refund-event row for a **manual refund** |

PayPal redelivers a failed (non-2xx) webhook up to 25 times over 3 days.
After that, nothing retries automatically - which is why the review query
below has to be checked.

## Review query (run daily while PayPal is live)

Service role / SQL editor only (the table has RLS on with no policies).

```sql
SELECT id, created_at, updated_at, paypal_event_id, event_type, sale_id,
       paypal_subscription_id, subscription_id, outcome, paypal_cancellation,
       review_reason
FROM public.paypal_refund_events
WHERE (outcome = 'needs_review'
       OR paypal_cancellation = 'pending'
       OR review_reason IS NOT NULL)
  AND coalesce(review_reason, '') NOT LIKE 'RESOLVED:%'
ORDER BY created_at;
```

Anything this returns is an open case. A row that is less than about 3 days
old with `paypal_cancellation = 'pending'` may still be fixed by PayPal's own
redeliveries; older ones will not.

## Logs

Every webhook delivery writes one JSON line containing `"msg":"paypal_webhook"`
with: `event_id`, `event_type`, `transmission_id`, `signature`
(`verified` / `invalid` / `unavailable` / `not_checked`), `outcome`, `detail`,
`cancellation`, `needs_review`, `http_status`, `retry`, `duration_ms`.

- Search the Vercel runtime logs for `"needs_review":true` to see cases as
  they happen.
- `"http_status":500` with `"retry":true` means PayPal will redeliver.
- No credentials, tokens, payer names or emails are logged.

## Resolving each case

Always check PayPal first (dashboard, or a read-only `GET
/v1/billing/subscriptions/{id}` and `GET /v1/payments/sale/{sale_id}`).

### `paypal_cancellation = 'pending'`

Access is already revoked; the PayPal subscription may still be billing.

1. Look up `paypal_subscription_id` in PayPal.
2. If PayPal shows **CANCELLED** or **EXPIRED**: mark it confirmed.
3. If PayPal still shows **ACTIVE** or **SUSPENDED**: cancel it in the PayPal
   dashboard, confirm it now shows CANCELLED, then mark it confirmed.

```sql
UPDATE public.paypal_refund_events
SET paypal_cancellation = 'confirmed',
    review_reason = 'RESOLVED: <date> <who> - cancellation confirmed in PayPal',
    updated_at = now()
WHERE id = <id>;
```

### `outcome = 'needs_review'`

Access was **not** changed. Read `review_reason`:

- *"not a recorded ScoutAfrica PayPal payment"* - usually a payment that was
  never applied (e.g. a conflicting subscription that was cancelled and
  refunded manually). Confirm no ScoutAfrica access is attached, then resolve.
- *"no longer linked to PayPal"* / *"not found on linked PayPal subscription"*
  - the member has since moved to another provider or subscription. Decide
  manually whether their current access should change. The webhook
  deliberately does not guess.
- *"PayPal reports sale ... as COMPLETED, not refunded"* or *"processing
  failed"* - usually fixed by PayPal's next redelivery (the row is then
  overwritten with the final outcome). If it is still open after 3 days,
  check the sale in PayPal and handle it as the policy says.

Then mark it handled:

```sql
UPDATE public.paypal_refund_events
SET review_reason = 'RESOLVED: <date> <who> - <what was done> | ' || coalesce(review_reason, ''),
    updated_at = now()
WHERE id = <id>;
```

### `review_reason` starts with "Renewal payment ... was taken after access was revoked"

PayPal charged a renewal after a full refund or reversal (the original cancel
never went through). Premium was not re-granted.

1. Confirm the subscription is now CANCELLED in PayPal (cancel it in the
   dashboard if not).
2. Refund the named renewal sale in full in the PayPal dashboard. Its refund
   webhook will be recorded as `needs_review` ("not a recorded ScoutAfrica
   PayPal payment") - expected, and resolved the same way.
3. Mark the row resolved with the `RESOLVED:` update above, and set
   `paypal_cancellation = 'confirmed'` once PayPal shows CANCELLED.

## Notes

- `RESOLVED:` at the start of `review_reason` is a convention, not a column -
  there is no `resolved_at` field (adding one needs a migration).
- A later renewal on the same subscription re-opens a resolved row
  automatically (the new note is put in front of `RESOLVED:`).
- If PayPal redelivers (or someone resends) the original refund event, the
  webhook rewrites that row's outcome and `review_reason`, which can remove a
  `RESOLVED:` note. Re-check the row after any manual resend.
- Never re-grant Premium by hand for a refunded or reversed payment without
  a new confirmed payment.
