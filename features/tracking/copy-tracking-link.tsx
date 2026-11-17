"use client";

import { Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { trackingPath } from "./contracts";

export function CopyTrackingLink({ trackingNumber }: { trackingNumber: string }) {
  async function copy() {
    const url = `${window.location.origin}${trackingPath(trackingNumber)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Tracking link copied", "Anyone with this link can see the delivery status, but not names, phones or addresses.");
    } catch {
      toast.error("Could not copy the link", url);
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={() => void copy()}>
      <Link2 aria-hidden="true" /> Copy tracking link
    </Button>
  );
}
