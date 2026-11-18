# How prices are calculated

The price of a shipment depends on the parcel weight and is worked out when you book. Prices are in Bangladeshi taka (BDT).

## Weight bands

ExpressHub uses pricing rules. Each rule covers a weight band, from a minimum to a maximum weight, and has a base fee and a fee per additional kilogram. Exactly one active rule must cover your parcel's weight. If no rule, or more than one rule, covers it, booking is refused with a message that pricing is unavailable for that weight.

## The formula

Price = base fee + (extra kilograms × fee per additional kilogram).

Extra kilograms are the weight above the band's minimum, rounded up to the next whole kilogram. For example, with a band starting at 1 kg, a base fee of 100 BDT and 20 BDT per additional kilogram, a 2.3 kg parcel has 2 extra kilograms (1.3 rounded up) and costs 100 + 2 × 20 = 140 BDT.

## When the price is fixed

The price is calculated once, at booking, and stored with the shipment. Later changes to pricing rules do not change the price of shipments you already booked. Package dimensions do not affect the price.
