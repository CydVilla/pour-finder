import "server-only";

/**
 * GitHub issue mirror for moderation tasks.
 *
 * Why an outside tracker at all: it gives moderation a real inbox, a history,
 * notifications, and - if you have GitHub Copilot's coding agent enabled - a
 * place to hand a task to an agent. It is strictly a *mirror*: the database is
 * the source of truth, and an issue never changes live data on its own.
 *
 * Everything here is best-effort. A failed GitHub call is recorded on the task
 * (`externalError`) and never fails the user's request - somebody leaving a
 * comment must not see an error because a token expired.
 *
 * Assignees: put `Copilot` in GITHUB_ISSUE_ASSIGNEES to hand tasks to the
 * Copilot coding agent. That needs a paid Copilot plan with the agent enabled
 * for the repo; when assignment is rejected we retry once WITHOUT assignees so
 * the issue still gets filed.
 */

export interface GitHubIssueInput {
  title: string;
  body: string;
  labels?: string[];
}

export interface GitHubIssueResult {
  ok: boolean;
  number?: number;
  url?: string;
  error?: string;
  assigneesApplied?: string[];
}

interface GitHubConfig {
  token: string;
  owner: string;
  repo: string;
  labels: string[];
  assignees: string[];
}

export function githubConfig(): GitHubConfig | null {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  if (!token || !repo || !repo.includes("/")) return null;

  const [owner, name] = repo.split("/");
  if (!owner || !name) return null;

  return {
    token,
    owner,
    repo: name,
    labels: splitEnv(process.env.GITHUB_ISSUE_LABELS) ?? ["pour-finder", "data-review"],
    assignees: splitEnv(process.env.GITHUB_ISSUE_ASSIGNEES) ?? [],
  };
}

export function isGitHubEscalationEnabled(): boolean {
  return githubConfig() !== null;
}

export async function createIssue(input: GitHubIssueInput): Promise<GitHubIssueResult> {
  const config = githubConfig();
  if (!config) return { ok: false, error: "GitHub escalation is not configured" };

  const labels = [...new Set([...config.labels, ...(input.labels ?? [])])];

  const attempt = (assignees: string[]): Promise<Response> =>
    fetch(`https://api.github.com/repos/${config.owner}/${config.repo}/issues`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        "User-Agent": "pour-finder",
      },
      body: JSON.stringify({
        title: input.title.slice(0, 250),
        body: input.body,
        labels,
        ...(assignees.length > 0 ? { assignees } : {}),
      }),
      // Never let a hung GitHub call hold a user request open.
      signal: AbortSignal.timeout(8000),
    });

  try {
    let response = await attempt(config.assignees);
    let assigneesApplied = config.assignees;

    // 422 here almost always means an assignee can't be assigned - most often
    // `Copilot` on a repo without the coding agent, or a plan that lacks it.
    // Filing the issue matters more than assigning it, so retry bare.
    if (!response.ok && response.status === 422 && config.assignees.length > 0) {
      console.warn("[github] assignee rejected; retrying without assignees");
      response = await attempt([]);
      assigneesApplied = [];
    }

    if (!response.ok) {
      const detail = await safeText(response);
      return { ok: false, error: `GitHub ${response.status}: ${detail.slice(0, 300)}` };
    }

    const issue = (await response.json()) as { number: number; html_url: string };
    return { ok: true, number: issue.number, url: issue.html_url, assigneesApplied };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Adds a note to an existing issue when more reports arrive for the same task. */
export async function commentOnIssue(issueNumber: string, body: string): Promise<boolean> {
  const config = githubConfig();
  if (!config) return false;

  try {
    const response = await fetch(
      `https://api.github.com/repos/${config.owner}/${config.repo}/issues/${issueNumber}/comments`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
          "User-Agent": "pour-finder",
        },
        body: JSON.stringify({ body }),
        signal: AbortSignal.timeout(8000),
      },
    );
    return response.ok;
  } catch {
    return false;
  }
}

function splitEnv(value: string | undefined): string[] | null {
  if (!value) return null;
  const parts = value.split(",").map((v) => v.trim()).filter(Boolean);
  return parts.length > 0 ? parts : null;
}

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "<unreadable>";
  }
}
