/**
 * Host half: one Session projection of owned background jobs.
 *
 * The sidebar needs a per-session running-job count for every card, but the
 * job registry is process-local and the browser-side `ctx.jobs` rosters only
 * exist for watched sessions. The registry already writes `job/registered`
 * and `job/settled` into the owning Session, so folding those records gives
 * every Session list row a count with no extra stream.
 *
 * Jobs are process-local: a registration from a previous process can never
 * still be running, and a settlement may be missing when the app dies. The
 * state therefore carries the process start and counts only registrations
 * made after it; a cached state from an older process views as zero until the
 * next job event resets it. `session/end-seed` clears inherited fork history.
 */

/** Client-visible projection key; the Client half reads the same value. */
export const KEY = 'sidebarShelvesJobActivity';

const PROCESS_STARTED_AT = Date.now();

/** The projection registry only calls `parse`; the shapes are owned here. */
const passthrough = { parse: (value) => value };

function init() {
  return { processStart: PROCESS_STARTED_AT, jobs: {} };
}

function fold(state, event) {
  if (state === null || typeof state !== 'object' || state.processStart !== PROCESS_STARTED_AT) {
    state = { processStart: PROCESS_STARTED_AT, jobs: {} };
  }
  const known = state.jobs ?? {};
  if (event.type === 'session/end-seed') {
    return Object.keys(known).length === 0 ? state : { ...state, jobs: {} };
  }
  if (event.type === 'job/registered') {
    const data = event.data;
    if (data === undefined || typeof data.jobId !== 'string' || typeof data.startedAt !== 'number') return state;
    if (data.startedAt < state.processStart || known[data.jobId] !== undefined) return state;
    return {
      ...state,
      jobs: {
        ...known,
        [data.jobId]: {
          kind: typeof data.kind === 'string' ? data.kind : '',
          label: typeof data.label === 'string' ? data.label.slice(0, 80) : '',
          startedAt: data.startedAt,
        },
      },
    };
  }
  if (event.type === 'job/settled') {
    const id = event.data?.jobId;
    if (id === undefined || known[id] === undefined) return state;
    const jobs = { ...known };
    delete jobs[id];
    return { ...state, jobs };
  }
  return state;
}

function view(state) {
  if (state === null || typeof state !== 'object' || state.processStart !== PROCESS_STARTED_AT) return { running: 0, labels: [] };
  const jobs = state.jobs ?? {};
  let running = 0;
  const labels = [];
  for (const job of Object.values(jobs)) {
    // A background subagent is already counted as a running child Session.
    if (job.kind === 'subagent') continue;
    running += 1;
    if (labels.length < 3 && job.label !== '') labels.push(job.label);
  }
  return { running, labels };
}

export function apply(ctx) {
  // Wait for the registry rather than skipping when plugin order puts it later.
  ctx.inject(['sessionProjections'], (scope) => {
    scope.sessionProjections.register({
      key: KEY,
      stateSchema: passthrough,
      init,
      apply: fold,
      wire: { viewSchema: passthrough, view },
      stateVersion: 1,
    });
  });
}
