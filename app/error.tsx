"use client";
import Link from "next/link";
import { Button, ErrorNotice } from "@/components/ui/primitives";
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main id="main-content" className="narrow-page"><ErrorNotice action={<Button onClick={reset}>Try again</Button>}>We could not display this page. Try again or return to the home page.</ErrorNotice><Link href="/">Back to home</Link></main>;
}
