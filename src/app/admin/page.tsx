import type { Metadata } from "next";
import { desc, inArray } from "drizzle-orm";
import { db } from "@/db";
import { moderationTasks } from "@/db/schema";
import { AdminQueue } from "@/components/AdminQueue";
import { AdminLogin } from "@/components/AdminLogin";
import { adminTokenConfigured, isAdmin } from "@/server/admin";
import { listPendingSubmissions } from "@/server/submissions";

/**
 * Minimal moderation surface. The consumer experience is the priority, so this
 * is deliberately plain - but every action here goes through the same services
 * the public API uses, so the audit trail is identical.
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Moderation", robots: { index: false } };

export default async function AdminPage() {
  if (!adminTokenConfigured()) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16">
        <h1 className="wordmark text-2xl">Admin is disabled</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Set <code className="rounded bg-paper-sunk px-1">ADMIN_TOKEN</code> (16+ characters) to
          enable the moderation queue.
        </p>
      </main>
    );
  }

  if (!(await isAdmin())) return <AdminLogin />;

  const [submissions, tasks] = await Promise.all([
    listPendingSubmissions(50),
    db
      .select()
      .from(moderationTasks)
      .where(inArray(moderationTasks.status, ["open", "in_progress"]))
      .orderBy(desc(moderationTasks.createdAt))
      .limit(50),
  ]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="wordmark text-2xl">Moderation</h1>
      <AdminQueue
        submissions={submissions.map((s) => ({
          id: s.id,
          type: s.type,
          payload: s.payload,
          createdAt: s.createdAt.toISOString(),
          possibleDuplicateOf: s.possibleDuplicateOf,
          sourceUrl: s.sourceUrl,
        }))}
        tasks={tasks.map((t) => ({
          id: t.id,
          kind: t.kind,
          title: t.title,
          reason: t.reason,
          externalUrl: t.externalUrl,
          externalError: t.externalError,
          createdAt: t.createdAt.toISOString(),
        }))}
      />
    </main>
  );
}
