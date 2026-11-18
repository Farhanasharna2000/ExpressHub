# Paying for a shipment

Shipments are paid by card through Stripe Checkout. ExpressHub never sees or stores your card number.

## How to pay

Open the shipment and choose Pay with Stripe. You are taken to Stripe's secure checkout page. After paying you come back to ExpressHub, where the payment page checks the result and updates automatically.

## Why a payment can show as pending

A payment is only marked Paid when Stripe confirms it to ExpressHub directly. Coming back from the checkout page is not proof of payment on its own. This usually takes a few seconds; you can use Refresh status on the payment page.

## Checkout time limit

A Stripe checkout session expires after one hour. If it expires before you pay, start a new payment from the shipment page. While a checkout is still open, the shipment cannot be cancelled until that checkout is completed or expires.

## Payment before pickup

A courier can only pick up, move or deliver a shipment once its payment is confirmed as Paid. You can see all your payments under Payments.
