import { ButtonLink, Card, StatusBadge } from "@/components/ui/primitives";
export default function Home() {
  return (
    <div className="page-stack">
      <section className="hero">
        <div>
          <p className="eyebrow">A little care. Every step of the way.</p>
          <h1>
            Big plans.
            <br />
            Small parcels.
            <br />
            <span>All connected.</span>
          </h1>
          <p>
            A simpler way to move what matters. Bring your bookings, payments,
            and delivery updates together with ExpressHub.
          </p>
          <div className="actions">
            <ButtonLink href="/register">Get started ↗</ButtonLink>
            <ButtonLink href="/login" secondary>
              Sign in
            </ButtonLink>
          </div>
        </div>
        <div className="journey-card">
          <p className="eyebrow">The delivery journey</p>
          <div className="parcel-art" aria-hidden="true">
            <span>EH ↗</span>
          </div>
          <h2>
            From your doorstep
            <br />
            to theirs.
          </h2>
          <ol className="journey">
            <li>
              <span>01</span> Book your shipment
            </li>
            <li>
              <span>02</span> Pay securely with Stripe
            </li>
            <li>
              <span>03</span> Follow delivery updates
            </li>
          </ol>
          <div className="actions">
            <StatusBadge status="IN_TRANSIT" />
            <span className="muted">Example status</span>
          </div>
        </div>
      </section>
      <section>
        <p className="eyebrow">One service. Three perspectives.</p>
        <h2>A place for every part of the journey.</h2>
        <div className="grid-three">
          {[
            {
              title: "Send with confidence",
              text: "Organize your shipments, payments, and delivery history.",
              href: "/customer",
              link: "Customer workspace",
            },
            {
              title: "Keep deliveries moving",
              text: "A focused space for assigned pickups and delivery updates.",
              href: "/courier",
              link: "Courier workspace",
            },
            {
              title: "Bring it all together",
              text: "Coordinate couriers, users, and shipment operations.",
              href: "/admin",
              link: "Admin workspace",
            },
          ].map((item, index) => (
            <Card key={item.href}>
              <span className="step-number">0{index + 1}</span>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
              <ButtonLink href={item.href} secondary>
                {item.link} →
              </ButtonLink>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
