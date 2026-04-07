import { reviewQueue } from "../../data/mockData";
import { Badge } from "../ui/Badge";
import { Card } from "../ui/Card";

const stateTone = {
  pending: "warning",
  escalated: "accent",
  accepted: "success",
} as const;

export function UploadReviewTable() {
  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-y-3">
          <caption className="mb-4 text-left text-sm text-[var(--text-muted)]">
            Clinician-gated uploads remain in-memory mock records for the MVP.
          </caption>
          <thead>
            <tr className="text-left text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">
              <th className="pb-2">File</th>
              <th className="pb-2">Submitted by</th>
              <th className="pb-2">State</th>
              <th className="pb-2">Reviewer note</th>
            </tr>
          </thead>
          <tbody>
            {reviewQueue.map((item) => (
              <tr key={item.id} className="soft-panel">
                <td className="rounded-l-2xl px-4 py-4">
                  <p className="font-medium text-[var(--text)]">{item.fileName}</p>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">{item.submittedAt}</p>
                </td>
                <td className="px-4 py-4 text-sm text-[var(--text-muted)]">{item.submittedBy}</td>
                <td className="px-4 py-4">
                  <Badge tone={stateTone[item.state]}>{item.state}</Badge>
                </td>
                <td className="rounded-r-2xl px-4 py-4 text-sm text-[var(--text-muted)]">
                  {item.reviewerNote}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
