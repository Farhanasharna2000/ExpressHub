import Link from "next/link";
import {
  Button,
  ButtonLink,
  Card,
  EmptyState,
  Input,
  Select,
} from "@/components/ui/primitives";

export function PageShell({
  title,
  description,
  kind = "detail",
  action,
  back,
}: {
  title: string;
  description: string;
  kind?: "list" | "detail" | "overview" | "booking";
  action?: { href: string; label: string };
  back?: { href: string; label: string };
}) {
  return (
    <div className="page-stack">
      {back && (
        <Link className="back-link" href={back.href}>
          ← {back.label}
        </Link>
      )}
      <div className="page-heading">
        <div>
          <p className="eyebrow">ExpressHub / Workspace</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        {action && <ButtonLink href={action.href}>{action.label}</ButtonLink>}
      </div>
      {kind === "overview" && (
        <div className="grid-three">
          {["Plan your next step", "Follow the journey", "Stay up to date"].map(
            (label, i) => (
              <Card key={label}>
                <span className="step-number">0{i + 1}</span>
                <h2>{label}</h2>
                <p>
                  Your workspace will bring shipment activity and updates
                  together.
                </p>
              </Card>
            ),
          )}
        </div>
      )}
      {kind === "list" && (
        <Card>
          <div className="filter-row">
            <Input
              id="search"
              label="Search records"
              placeholder="Search will be available soon"
              disabled
            />
            <Select id="status" label="Filter" disabled>
              <option>All records</option>
            </Select>
          </div>
          <EmptyState
            title="Records are not connected yet"
            description="Your authorized records will appear here in a later implementation phase."
          />
        </Card>
      )}
      {kind === "booking" && (
        <Card>
          <ol className="booking-steps">
            <li>Pickup</li>
            <li>Delivery</li>
            <li>Parcel</li>
            <li>Review</li>
          </ol>
          <h2>Where should we pick up?</h2>
          <p>
            The booking form will be available in a later implementation phase.
          </p>
          <fieldset disabled className="form-grid">
            <legend className="sr-only">Pickup details preview</legend>
            <Input id="pickup-name" label="Contact name" autoComplete="name" />
            <Input
              id="pickup-phone"
              label="Phone number"
              type="tel"
              autoComplete="tel"
            />
            <Input
              id="pickup-address"
              label="Pickup address"
              autoComplete="street-address"
            />
            <Button disabled>Continue to delivery</Button>
          </fieldset>
        </Card>
      )}
      {(kind === "detail" || kind === "overview") && (
        <Card>
          <EmptyState
            title={
              kind === "detail"
                ? "Details are not connected yet"
                : "Your activity will appear here"
            }
            description="Live shipment records will be connected in a later implementation phase."
          />
        </Card>
      )}
    </div>
  );
}
