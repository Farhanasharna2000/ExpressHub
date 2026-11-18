# Refunds

Refunds go back to the card used for the Stripe payment. Only Stripe card payments can be refunded through ExpressHub.

## When you can get a refund

A customer can request a refund for a paid shipment that is still Created (not yet picked up) or Cancelled. Refunding a shipment that is still Created also cancels it and adds a cancellation to its timeline. Once a shipment has been picked up, customers cannot request a refund.

## Refunds made by admins

Admins can refund shipments that are Created, Cancelled, Failed or Returned. A shipment that is Picked up, In transit, Out for delivery or Delivered cannot be refunded, because that would leave a parcel on the road without a valid payment.

## Refund statuses

While Stripe processes the refund, the payment shows Refund pending. When Stripe confirms it, the payment becomes Refunded. A payment can only be refunded once. How long the money takes to appear on your card statement depends on your bank.
