# Shipment statuses explained

Every shipment moves through a fixed set of statuses. Each change is recorded on the shipment's timeline with the time it happened.

## The statuses

- Created: the shipment is booked and waiting for payment and pickup.
- Picked up: the courier has collected the parcel.
- In transit: the parcel is moving through the network, possibly between hubs.
- Out for delivery: the courier is on the way to the recipient.
- Delivered: the parcel was handed over and proof of delivery was captured.
- Failed: the delivery attempt did not succeed.
- Returned: the parcel was returned after a failed delivery.
- Cancelled: the shipment was cancelled before pickup.

## The order of statuses

A shipment goes Created, then Picked up, In transit, Out for delivery and Delivered. From Out for delivery it can also go to Failed. From Failed an admin can send it back to In transit for another attempt, or mark it Returned. Created can also go to Cancelled. Delivered, Returned and Cancelled are final.

## Who can change the status

Couriers move their assigned shipments forward. Only admins can retry or return a failed delivery. Customers can only cancel their own shipment, and only before pickup. Delivered, Failed and Returned always need a note explaining what happened.
