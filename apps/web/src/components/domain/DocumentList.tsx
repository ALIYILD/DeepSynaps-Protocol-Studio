import { workspaceDocuments } from "../../data/mockData";
import { WorkspaceDocument, WorkspaceSection } from "../../types/domain";
import { Badge } from "../ui/Badge";
import { Card } from "../ui/Card";

const statusTone: Record<WorkspaceDocument["status"], "neutral" | "accent" | "success" | "warning"> = {
  draft: "neutral",
  review: "warning",
  approved: "success",
  restricted: "accent",
};

export function DocumentList({
  section,
  query,
}: {
  section?: WorkspaceSection;
  query: string;
}) {
  const normalizedQuery = query.trim().toLowerCase();
  const documents = workspaceDocuments.filter((document) => {
    const matchesSection = section ? document.section === section : true;
    const matchesQuery =
      normalizedQuery.length === 0 ||
      [document.title, document.summary, document.owner, document.section]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    return matchesSection && matchesQuery;
  });

  return (
    <div className="grid gap-4">
      {documents.map((document) => (
        <Card key={document.id}>
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={statusTone[document.status]}>{document.status}</Badge>
                <Badge>{document.evidence}</Badge>
              </div>
              <h3 className="mt-4 font-display text-xl text-[var(--text)]">{document.title}</h3>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--text-muted)]">
                {document.summary}
              </p>
            </div>
            <dl className="grid min-w-[180px] gap-2 text-sm text-[var(--text-muted)]">
              <div>
                <dt className="font-medium text-[var(--text)]">Owner</dt>
                <dd>{document.owner}</dd>
              </div>
              <div>
                <dt className="font-medium text-[var(--text)]">Audience</dt>
                <dd>{document.audience}</dd>
              </div>
              <div>
                <dt className="font-medium text-[var(--text)]">Updated</dt>
                <dd>{document.updatedAt}</dd>
              </div>
            </dl>
          </div>
        </Card>
      ))}
      {documents.length === 0 ? (
        <Card>
          <p className="text-sm text-[var(--text-muted)]">
            No workspace documents match the current search and section filters.
          </p>
        </Card>
      ) : null}
    </div>
  );
}
