import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrackForm } from "@/features/tracking/track-form";

export const metadata: Metadata = {
  title: "Track a parcel",
  description: "Enter your ExpressHub tracking number to see live delivery status.",
};

export default function TrackPage() {
  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Public tracking</p>
          <h1>Track a parcel</h1>
          <p>No account needed. Status updates appear live while the page is open.</p>
        </div>
      </div>
      <Card>
        <CardHeader><CardTitle>Tracking number</CardTitle></CardHeader>
        <CardContent><TrackForm /></CardContent>
      </Card>
    </div>
  );
}
