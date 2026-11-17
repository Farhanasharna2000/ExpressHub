import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrackForm } from "@/features/tracking/track-form";

export default function TrackingNotFound() {
  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Public tracking</p>
          <h1>We couldn&apos;t find that parcel</h1>
          <p>Check the tracking number on your booking confirmation and try again.</p>
        </div>
      </div>
      <Card>
        <CardHeader><CardTitle>Track a parcel</CardTitle></CardHeader>
        <CardContent><TrackForm /></CardContent>
      </Card>
    </div>
  );
}
