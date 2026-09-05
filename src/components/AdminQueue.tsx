"use client";

import { useState } from "react";

interface SubmissionRow {
  id: string;
  type: string;
  payload: unknown;
  createdAt: string;
  possibleDuplicateOf: { kind: string; id: string; label: string; score: number }[];
  sourceUrl: string | null;
}

interface TaskRow {
  id: string;
  kind: string;
  title: string;
  reason: string;
  externalUrl: string | null;
  externalError: string | null;
  createdAt: string;
}

export function AdminQueue({
  submissions,
  tasks,
}: {
  submissions: SubmissionRow[];
  tasks: TaskRow[];
}) {
  const [handled, setHandled] = useState<Record<string, string>>({});

  const act = async (url: string, body: unknown, key: string, label: string) => {
    setHandled((h) => ({ ...h, [key]: "…" }));
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setHandled((h) => ({ ...h, [key]: response.ok ? label : "failed" }));
    } catch {
      setHandled((h) => ({ ...h, [key]: "failed" }));
    }
  };

  return (
    <div className="mt-6 space-y-8">
      <section>
        <h2 className="text-xs font-bold uppercase tracking-wide text-ink-faint">
          Reported as gone ({tasks.length})
        </h2>
        {tasks.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">Nothing waiting.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {tasks.map((task) => (
              <li key={task.id} className="pf-card p-3">
                <p className="font-semibold">{task.title}</p>
                <p className="text-sm text-ink-soft">{task.reason}</p>
                {task.externalUrl && (
                  <a
                    href={task.externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs underline underline-offset-2"
                  >
                    Open tracker issue
                  </a>
                )}
                {task.externalError && (
                  <p className="text-xs text-outdated">Tracker sync failed: {task.externalError}</p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="pf-button pf-button-primary px-3 py-1.5 text-sm"
                    onClick={() =>
                      act(`/api/admin/tasks/${task.id}`, { decision: "apply" }, task.id, "expired")
                    }
                  >
                    Mark deal ended
                  </button>
                  <button
                    type="button"
                    className="pf-button pf-button-quiet px-3 py-1.5 text-sm"
                    onClick={() =>
                      act(`/api/admin/tasks/${task.id}`, { decision: "dismiss" }, task.id, "dismissed")
                    }
                  >
                    Leave it listed
                  </button>
                  {handled[task.id] && (
                    <span className="text-sm font-semibold text-fresh">{handled[task.id]}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-xs font-bold uppercase tracking-wide text-ink-faint">
          Pending submissions ({submissions.length})
        </h2>
        {submissions.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">Nothing waiting.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {submissions.map((submission) => (
              <li key={submission.id} className="pf-card p-3">
                <p className="font-semibold">{submission.type.replace(/_/g, " ")}</p>
                {submission.possibleDuplicateOf.length > 0 && (
                  <p className="mt-1 text-xs font-semibold text-stale">
                    Possible duplicate:{" "}
                    {submission.possibleDuplicateOf.map((d) => d.label).join("; ")}
                  </p>
                )}
                <pre className="pf-scroll mt-2 max-h-48 overflow-auto rounded bg-paper-sunk p-2 text-xs">
                  {JSON.stringify(submission.payload, null, 2)}
                </pre>
                {submission.sourceUrl && (
                  <a
                    href={submission.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="text-xs underline underline-offset-2"
                  >
                    Evidence link
                  </a>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="pf-button pf-button-primary px-3 py-1.5 text-sm"
                    onClick={() =>
                      act(
                        `/api/admin/submissions/${submission.id}`,
                        { action: "approve" },
                        submission.id,
                        "approved",
                      )
                    }
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="pf-button pf-button-quiet px-3 py-1.5 text-sm"
                    onClick={() =>
                      act(
                        `/api/admin/submissions/${submission.id}`,
                        { action: "reject" },
                        submission.id,
                        "rejected",
                      )
                    }
                  >
                    Reject
                  </button>
                  {handled[submission.id] && (
                    <span className="text-sm font-semibold text-fresh">
                      {handled[submission.id]}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
