import { redirect } from "next/navigation";

// The forecast now lives inside the SACCO view.
export default function AnalyticsRedirect({ params }: { params: { saccoId: string } }) {
  redirect(`/sacco/${encodeURIComponent(params.saccoId)}/forecast`);
}
