# Multi-merchant checkout recovery

`MultiMerchantCheckout` accepts two application adapters:

- `signEscrow(partition)` resolves with `{ escrowId, txHash }` only after the escrow is confirmed. It must reconcile ambiguous submission results before rejecting: rejection means no escrow was created and the merchant can safely be retried.
- `refundEscrow(receipt)` resolves only after the escrow's funds have been refunded. It must be idempotent for an escrow ID and reconcile ambiguous results. A cancellation request or grace-period response is not refund confirmation.

The component keeps successful receipts, retries only the failed merchant, and serializes wallet actions. Cancellation switches permanently to refund recovery: a failed refund can be retried without repeating already confirmed refunds, and checkout cannot resume signing halfway through rollback. The cart is cleared only when all merchants succeed; cancellation keeps it intact.

Receipts and transaction hashes remain visible during recovery. The parent drawer blocks dismissal while signing or while funds remain in an incomplete batch; browser unload also requests confirmation. State is held for the mounted checkout, not persisted across forced navigation or browser restarts. Production adapters should keep authoritative receipts and reconcile pending operations outside the component.

The default CartDrawer does not yet supply blockchain adapters. Checkout now fails explicitly when no signer is connected instead of simulating successful escrow creation. A missing refund adapter never reports that funds were returned. Wire both adapters when connecting the production checkout; the existing grace-period cancellation API cannot be treated as a completed refund.
