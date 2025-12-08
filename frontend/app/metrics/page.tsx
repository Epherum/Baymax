import { redirect } from "next/navigation";

export default function MetricsIndexPage() {
  // Keep /metrics as an entrypoint; send users to the Quick view by default.
  redirect("/metrics/quick");
}
