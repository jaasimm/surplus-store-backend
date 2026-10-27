# Surplus Store — automated API smoke test

Runs an end-to-end check of the whole commerce flow against a running server:

```
public browsing → guest cart → OTP login → cart merge → address → coupon →
COD order → Razorpay (mock) order + signature verification → retry/cancel →
wishlist/profile → admin dashboard/products/orders/customers/coupons → security checks
```

## Run it

1. Start MongoDB, then the API: `cd server && npm run dev` (port 5000).
2. Seed once: `npm run seed`.
3. In another terminal: `node server/scripts/smoke.mjs`

The script uses its own cookie jar and guest id, so it never touches your real
session. It creates a throwaway customer (random mobile) and a few test orders.

> Note: OTP requests are rate limited (15 per 15 minutes per IP, plus a 30 s
> per-number cooldown). If you re-run it many times quickly you will see `429`
> responses — restart the server to reset the in-memory counters.
