# G2 Rewards v2 rollout
Draft only. No production deploy, historical credit, or Firestore rules change.

Choose the first Bangkok calendar month (YYYY-MM) before launch. Set MEMBER_REWARDS_V2_FIRST_MONTH on the member service and use the same month's first instant (explicit +07:00 offset) as G2_REWARDS_V2_START_AT on POS. MEMBER_REWARDS_V2_ENABLED defaults false. Do not set rollout variables on either production service until the corresponding release is approved. The independent member write gate still applies.

New confirmed paid POS credits populate a month wallet and a carry wallet once per bill/member. Monthly rewards and carry rewards debit only the selected wallet. Legacy `monthlyPoints`, receipts, history, and already-issued rewards are preserved; the existing archive process still runs, but it stops issuing old automatic prizes for v2 months. Month wallet and stock keys change at midnight in Bangkok; carry survives rollover. No old balance is imported implicitly. Approve any balance transfer separately after a read-only reconciliation. Staff add points from trusted POS bills after cutover.

Test with dummy identities: four verified players in a two-hour paid round, replay the source after a delivery retry, attempt a cross-user claim, race for the last reward, scan a used ticket again, and check balances across Bangkok midnight. Verify any legacy pending outbox before switching. Customer QR is valid for five minutes and does not reserve stock; use staff confirmation order.
