# Cancelling a shipment

Customers can cancel their own shipment while it still has the status Created, which means before the courier picks it up.

## How to cancel

Open the shipment and choose Cancel shipment. Once the parcel has been picked up, a customer can no longer cancel it.

## Cancelling a paid shipment

If the shipment is already paid, cancelling it refunds the payment through Stripe automatically. The payment shows Refund pending until Stripe confirms the refund, then Refunded.

## When cancellation is blocked

You cannot cancel while a Stripe checkout for the shipment is still open. Finish the payment or wait for the checkout to expire after one hour, then cancel. Couriers cannot cancel shipments; admins can.
