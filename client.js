/**
 * Client half: replaces the `sidebar.workspaces` occupant with a t3code-style
 * session list.
 *
 * Unarchived sessions flow from the top of the column, newest input first with
 * pinned ones leading; the Archived shelf is pushed to the bottom. Each session
 * is a two-line card — a status icon in a fixed slot, the title, and its
 * relative time, then the pin, Workspace, and terminal markers.
 *
 * Archiving uses the Host's own durable state, never a derived status: a
 * session leaves the list only when the user archives it. Pinning is local and
 * independent of archiving.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-sidebar-shelves',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const NS = 'local.sidebarShelves';

    const DAY_MS = 86400000;
    const AUTO_CLEAR_MS = 2500;
    const SETTINGS_KEY = 'dsh:sidebar-shelves:settings';
    const PINNED_KEY = 'dsh:sidebar-shelves:pinned';
    const AUTO_ARCHIVE_CHOICES = [3, 7, 14, 30];

    const zh = {
      'shelf.archived': '已归档',
      'shelf.empty': '暂无会话',
      'session.untitled': '未命名',
      'session.new': '新会话',
      'rail.expand': '展开侧边栏',
      'settings.label': '侧边栏设置',
      'settings.autoArchive': '自动归档',
      'settings.off': '关闭',
      'settings.days': '{n} 天',
      'action.archive': '归档会话',
      'action.unarchive': '取消归档',
      'action.pin': '置顶会话',
      'action.unpin': '取消置顶',
      'status.working': '工作中',
      'status.approval': '待审批',
      'status.planReview': '待确认',
      'status.answer': '待回答',
      'status.done': '已完成',
      'terminal.open': '有终端',
      'time.now': '刚刚',
    };
    const en = {
      'shelf.archived': 'Archived',
      'shelf.empty': 'No sessions yet',
      'session.untitled': 'Untitled',
      'session.new': 'New Session',
      'rail.expand': 'Expand sidebar',
      'settings.label': 'Sidebar settings',
      'settings.autoArchive': 'Auto-archive',
      'settings.off': 'Off',
      'settings.days': '{n} days',
      'action.archive': 'Archive session',
      'action.unarchive': 'Unarchive session',
      'action.pin': 'Pin session',
      'action.unpin': 'Unpin session',
      'status.working': 'Working',
      'status.approval': 'Approval',
      'status.planReview': 'Plan review',
      'status.answer': 'Answer',
      'status.done': 'Done',
      'terminal.open': 'Terminal open',
      'time.now': 'now',
    };

    const css = [
      '.dsh-shelves-root{display:flex;flex-direction:column;flex:1 1 auto;min-height:0}',
      '.dsh-shelves-scroll{display:flex;flex-direction:column;flex:1 1 auto;min-height:0;overflow-y:auto;scrollbar-width:none;-ms-overflow-style:none}',
      '.dsh-shelves-scroll::-webkit-scrollbar{display:none;width:0;height:0}',
      '.dsh-shelves-stack{display:flex;flex:1 1 auto;flex-direction:column;gap:2px;padding:6px 4px 10px}',
      '.dsh-shelves-bottom{display:flex;flex-direction:column;gap:2px;margin-top:auto}',
      '.dsh-shelves-headrow{display:flex;align-items:center;gap:2px;margin-top:6px}',
      '.dsh-shelves-head{display:flex;flex:1 1 auto;align-items:center;gap:6px;box-sizing:border-box;height:32px;padding:0 6px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;font-weight:500;text-align:left;cursor:pointer}',
      '.dsh-shelves-head:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2))}',
      '.dsh-shelves-head:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}',
      '.dsh-shelves-chevron{display:inline-flex;flex:none;align-items:center;transition:transform .15s ease}',
      '.dsh-shelves-chevron-open{transform:rotate(90deg)}',
      '.dsh-shelves-count{margin-left:auto;font-weight:400;font-variant-numeric:tabular-nums;opacity:.75}',
      '.dsh-shelves-gear{display:inline-flex;flex:none;align-items:center;justify-content:center;box-sizing:border-box;width:26px;height:26px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;opacity:.6}',
      '.dsh-shelves-gear:hover,.dsh-shelves-gear[aria-expanded="true"]{opacity:1;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2))}',
      '.dsh-shelves-gear:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}',
      '.dsh-shelves-settings{margin:4px 0 6px;padding:8px 10px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1)}',
      '.dsh-shelves-settings-title{margin-bottom:2px;font-size:11px;font-weight:500;letter-spacing:.03em;color:var(--dsw-alias-label-secondary)}',
      '.dsh-shelves-setting{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:28px;font-size:12px;color:var(--dsw-alias-label-primary)}',
      '.dsh-shelves-select{position:relative;display:inline-flex;align-items:center}',
      '.dsh-shelves-select>select{appearance:none;-webkit-appearance:none;height:24px;padding:0 20px 0 8px;border:0;border-radius:6px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;cursor:pointer}',
      '.dsh-shelves-select>select:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.dsh-shelves-select-chevron{position:absolute;right:5px;display:inline-flex;pointer-events:none;color:var(--dsw-alias-label-secondary);transform:rotate(90deg)}',
      '.dsh-shelves-row{position:relative;display:flex;box-sizing:border-box;flex-direction:column;justify-content:center;width:100%;min-height:56px;padding:5px 10px;border-radius:8px;color:var(--dsw-alias-label-primary);font-size:14px;text-align:left;cursor:pointer;user-select:none}',
      '.dsh-shelves-row:hover{background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2))}',
      '.dsh-shelves-row:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}',
      '.dsh-shelves-row-selected{background:var(--dsw-alias-bg-layer-2)}',
      '.dsh-shelves-titleline{display:flex;align-items:center;gap:6px;min-width:0;min-height:22px}',
      '.dsh-shelves-title{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500}',
      '.dsh-shelves-row-archived .dsh-shelves-title{font-weight:400;color:var(--dsw-alias-label-secondary)}',
      '.dsh-shelves-metaline{display:flex;align-items:center;gap:6px;min-width:0;min-height:16px;margin-top:2px;font-size:12px;font-weight:400;color:var(--dsw-alias-label-secondary)}',
      '.dsh-shelves-ws{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dsh-shelves-term{display:inline-flex;flex:none;align-items:center;color:var(--dsw-alias-state-business-primary)}',
      '.dsh-shelves-time{margin-left:auto;flex:none;font-size:12px;font-variant-numeric:tabular-nums;opacity:.7;transition:opacity .12s ease}',
      '.dsh-shelves-status{display:inline-flex;align-items:center;justify-content:center;transition:opacity .12s ease}',
      '.dsh-shelves-status-working{color:var(--dsw-alias-brand-primary)}',
      '.dsh-shelves-status-warn{color:var(--dsw-alias-state-warn-primary)}',
      '.dsh-shelves-status-done{color:var(--dsw-alias-state-success-primary)}',
      '.dsh-shelves-spin{animation:dsh-shelves-spin 1.4s linear infinite;transform-origin:50% 50%}',
      '@keyframes dsh-shelves-spin{to{transform:rotate(360deg)}}',
      '.dsh-shelves-actions{position:absolute;top:50%;right:4px;z-index:1;display:flex;align-items:center;gap:2px;opacity:0;pointer-events:none;transform:translateY(-50%);transition:opacity .12s ease}',
      '.dsh-shelves-row:hover .dsh-shelves-actions,.dsh-shelves-row:focus-within .dsh-shelves-actions{opacity:1;pointer-events:auto}',
      '.dsh-shelves-action{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;width:30px;height:30px;padding:0;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}',
      '.dsh-shelves-action:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover-solid,var(--dsw-alias-bg-layer-2))}',
      '.dsh-shelves-action:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}',
      '.dsh-shelves-action-pinned{color:var(--dsw-alias-state-business-primary)}',
      '.dsh-shelves-pin{display:inline-flex;flex:none;align-items:center;color:var(--dsw-alias-state-business-primary)}',
      '.dsh-shelves-row:hover .dsh-shelves-time,.dsh-shelves-row:focus-within .dsh-shelves-time{opacity:0}',
      '.dsh-shelves-empty{padding:16px 10px;color:var(--dsw-alias-label-secondary);font-size:12px}',
      '.dsh-shelves-rail{display:inline-flex;flex:none;align-items:center;justify-content:center;box-sizing:border-box;width:36px;height:36px;margin:0 auto;border:0;border-radius:10px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:11px;font-variant-numeric:tabular-nums;cursor:pointer}',
      '.dsh-shelves-rail:hover{background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2))}',
      '.dsh-shelves-rail:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}',
      '.dsh-shelves-anim{animation:dsh-shelves-in .28s cubic-bezier(.22,.61,.36,1) both}',
      '@keyframes dsh-shelves-in{0%{opacity:0;filter:blur(3px);transform:translateY(-2px)}100%{opacity:1;filter:none;transform:none}}',
      '@media (prefers-reduced-motion:reduce){.dsh-shelves-chevron,.dsh-shelves-time,.dsh-shelves-status,.dsh-shelves-actions{transition:none}.dsh-shelves-spin,.dsh-shelves-anim{animation:none}}',
    ].join('');

    const EMPTY_LIST = { ids: [], byId: {}, projectionsBySession: {} };
    const EMPTY_TABS = [];
    const NO_SUBSCRIBE = () => () => {};

    const ICONS = {
      working: 'M12 3a9 9 0 1 0 9 9',
      approval: 'M12 3l7 3v5.5c0 4.2-2.9 7.6-7 9.5-4.1-1.9-7-5.3-7-9.5V6l7-3z',
      planReview: 'M8 6h12M8 12h12M8 18h7M4 6h.01M4 12h.01M4 18h.01',
      answer: 'M4 5h16v11H9l-5 4V5z',
      done: 'M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zM8.5 12.4l2.4 2.4 4.6-4.8',
      archive: 'M3.5 5.5h17v3.5h-17zM5.5 9v9.5h13V9M9.5 12.5h5',
      terminal: 'M3.5 5.5h17v13h-17zM7.5 10l2.5 2.5-2.5 2.5M13 14.5h3.5',
      chevron: 'M9 6l6 6-6 6',
      gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15H2.9a2 2 0 1 1 0-4H3a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 4.1V4a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 11h.1a2 2 0 1 1 0 4H21a1.7 1.7 0 0 0-1.6 1z',
      pin: 'M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z',
      unarchive: 'M3.5 5.5h17v3.5h-17zM5.5 9v9.5h13V9M12 15.5V10M9.5 12.5l2.5-2.5 2.5 2.5',
    };

    function glyph(name, size) {
      return h(
        'svg',
        {
          viewBox: '0 0 24 24',
          width: size,
          height: size,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.8,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
          className: name === 'working' ? 'dsh-shelves-spin' : undefined,
        },
        h('path', { d: ICONS[name] }),
      );
    }

    function readJson(key, fallback) {
      try {
        const raw = window.localStorage.getItem(key);
        if (raw === null) return fallback;
        const parsed = JSON.parse(raw);
        return parsed !== null && typeof parsed === 'object' ? parsed : fallback;
      } catch {
        return fallback;
      }
    }

    function writeJson(key, value) {
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
      } catch {
        /* storage is best effort; the session list still works without it */
      }
    }

    function normalizeSettings(raw) {
      return {
        autoArchiveDays: typeof raw.autoArchiveDays === 'number' ? raw.autoArchiveDays : null,
      };
    }

    function normalizePinned(raw) {
      return raw !== null && typeof raw === 'object' ? raw : {};
    }

    function toMillis(value) {
      if (typeof value === 'number') return value;
      if (typeof value === 'string') {
        const parsed = Date.parse(value);
        return Number.isNaN(parsed) ? 0 : parsed;
      }
      return 0;
    }

    function relativeTime(ms, now, t) {
      if (ms <= 0) return '';
      const minutes = Math.floor(Math.max(0, now - ms) / 60000);
      if (minutes < 1) return t('time.now');
      if (minutes < 60) return `${minutes}m`;
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return `${hours}h`;
      const days = Math.floor(hours / 24);
      if (days < 30) return `${days}d`;
      return `${Math.floor(days / 30)}mo`;
    }

    function workspaceLabels(items) {
      const labels = new Map();
      for (const workspace of items ?? []) {
        const label = workspace.title || workspace.path || '';
        for (const id of workspace.sessionIds ?? []) {
          if (!labels.has(id)) labels.set(id, label);
        }
      }
      return labels;
    }

    function deriveRows(list, statuses, labels, currentId, archived, pinned) {
      const byId = list.byId ?? {};
      const rows = [];
      for (const id of list.ids ?? []) {
        const session = byId[id];
        if (session === undefined) continue;
        if (session.origin === 'subagent') continue;
        if (session.blank === true && id !== currentId) continue;
        const status = statuses?.get?.(id);
        let childRunning = false;
        const children = list.projectionsBySession?.[id]?.values?.subagentCatalog;
        if (Array.isArray(children)) {
          for (const child of children) {
            if ((statuses?.get?.(child.id)?.running ?? byId[child.id]?.running) === true) {
              childRunning = true;
              break;
            }
          }
        }
        const running = (status?.running ?? session.running) === true || childRunning;
        const kind = status?.pendingInteraction?.kind;
        const pending = kind === 'approval' || kind === 'plan-review' || kind === 'question' ? kind : undefined;
        const completed = status?.completionUnread === true;
        const updatedAtMs = toMillis(session.updatedAt);
        rows.push({
          id,
          title: session.blank === true ? '' : (session.title ?? '').trim(),
          blank: session.blank === true,
          workspace: labels.get(id) ?? '',
          updatedAtMs,
          archived: archived.has(id),
          pinned: pinned[id] !== undefined,
          pending,
          completed,
          running,
        });
      }
      // Pinned sessions lead, then newest user input first, so a session you just
      // wrote in jumps to the top; the current blank draft stays above both.
      rows.sort((left, right) => {
        if (left.blank !== right.blank) return left.blank ? -1 : 1;
        if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
        return right.updatedAtMs - left.updatedAtMs;
      });
      return rows;
    }

    function statusOf(row, unseen, t) {
      if (row.pending === 'approval') return { key: 'approval', tone: 'warn', label: t('status.approval') };
      if (row.pending === 'plan-review') return { key: 'planReview', tone: 'warn', label: t('status.planReview') };
      if (row.pending === 'question') return { key: 'answer', tone: 'warn', label: t('status.answer') };
      if (row.running) return { key: 'working', tone: 'working', label: t('status.working') };
      if (row.completed || unseen) return { key: 'done', tone: 'done', label: t('status.done') };
      return undefined;
    }

    function Shelves(props) {
      const { wide, expandSidebar, useSessions, useSessionStatus, useWorkspaces, usePanelInfo, openSession, archiveSession, unarchiveSession, getOpenTabs, t } = props;
      const list = useSessions((state) => state) ?? EMPTY_LIST;
      const statuses = useSessionStatus((state) => state);
      const items = useWorkspaces((state) => state.items);
      const archivedIds = useWorkspaces((state) => state.archivedSessionIds);
      const panelActive = usePanelInfo((info) => info.activePanelId !== null);

      // Terminal presence, not activity: `openTabs` reports every open tab across
      // saved and adopted Sessions, which is the only terminal fact a client can read.
      const tabsStore = getOpenTabs();
      const subscribeTabs = React.useCallback(
        (onChange) => (tabsStore ? tabsStore.subscribe(onChange) : NO_SUBSCRIBE()),
        [tabsStore],
      );
      const readTabs = React.useCallback(() => (tabsStore ? tabsStore.getSnapshot() : EMPTY_TABS), [tabsStore]);
      const openTabs = React.useSyncExternalStore(subscribeTabs, readTabs);
      const terminalSessions = React.useMemo(() => {
        const ids = new Set();
        for (const tab of openTabs ?? EMPTY_TABS) {
          if (tab.kind === 'terminal') ids.add(tab.sessionId);
        }
        return ids;
      }, [openTabs]);

      const [settings, setSettings] = React.useState(() => normalizeSettings(readJson(SETTINGS_KEY, {})));
      const [pinned, setPinned] = React.useState(() => normalizePinned(readJson(PINNED_KEY, {})));
      const [settingsOpen, setSettingsOpen] = React.useState(false);
      const [archivedOpen, setArchivedOpen] = React.useState(false);
      const [clock, bumpClock] = React.useReducer((n) => n + 1, 0);

      React.useEffect(() => {
        const id = window.setInterval(bumpClock, 60000);
        return () => window.clearInterval(id);
      }, []);

      const updateSettings = (patch) =>
        setSettings((prev) => {
          const next = { ...prev, ...patch };
          writeJson(SETTINGS_KEY, next);
          return next;
        });

      const updatePinned = (next) => {
        setPinned(next);
        writeJson(PINNED_KEY, next);
      };

      const currentId = React.useMemo(() => {
        const byId = list.byId ?? {};
        for (const id of Object.keys(byId)) {
          if ((byId[id]?.retainedBy?.mainView ?? 0) > 0) return id;
        }
        return undefined;
      }, [list]);

      const archived = React.useMemo(() => new Set(archivedIds ?? []), [archivedIds]);
      const rows = React.useMemo(
        () => deriveRows(list, statuses, workspaceLabels(items), currentId, archived, pinned),
        [list, statuses, items, currentId, archived, pinned],
      );

      // A run that ends stays marked "Done" until the row is opened. DSH's own
      // `completionUnread` only fires for a session that is not the main view and
      // clears as soon as it becomes one, so watching a session finish leaves no trace.
      // The session on screen clears its marker by itself instead of waiting for a click.
      const previousRunning = React.useRef(new Map());
      const autoClear = React.useRef(new Map());
      const [unseen, setUnseen] = React.useState(() => new Set());

      const cancelAutoClear = (id) => {
        const handle = autoClear.current.get(id);
        if (handle === undefined) return;
        window.clearTimeout(handle);
        autoClear.current.delete(id);
      };

      const forget = (id) =>
        setUnseen((current) => {
          if (!current.has(id)) return current;
          const copy = new Set(current);
          copy.delete(id);
          return copy;
        });

      React.useEffect(() => {
        const previous = previousRunning.current;
        const next = new Map();
        const added = [];
        const removed = [];
        for (const row of rows) {
          next.set(row.id, row.running);
          if (row.running) removed.push(row.id);
          else if (previous.get(row.id) === true) added.push(row.id);
        }
        previousRunning.current = next;
        if (added.length === 0 && removed.length === 0) return;

        for (const id of removed) cancelAutoClear(id);
        setUnseen((current) => {
          const copy = new Set(current);
          let changed = false;
          for (const id of added) {
            if (!copy.has(id)) {
              copy.add(id);
              changed = true;
            }
          }
          for (const id of removed) {
            if (copy.has(id)) {
              copy.delete(id);
              changed = true;
            }
          }
          return changed ? copy : current;
        });

        for (const id of added) {
          if (id !== currentId) continue;
          cancelAutoClear(id);
          autoClear.current.set(
            id,
            window.setTimeout(() => {
              autoClear.current.delete(id);
              forget(id);
            }, AUTO_CLEAR_MS),
          );
        }
      }, [rows, currentId]);

      React.useEffect(
        () => () => {
          for (const handle of autoClear.current.values()) window.clearTimeout(handle);
          autoClear.current.clear();
        },
        [],
      );

      // Opt-in inactivity window. A session idle past the configured days is
      // archived through the Host once; running work, pending questions, unseen
      // results, drafts, and the on-screen session are left alone.
      const attempted = React.useRef(new Set());
      React.useEffect(() => {
        const days = settings.autoArchiveDays;
        if (days === null) return;
        const now = Date.now();
        for (const row of rows) {
          if (row.archived || row.blank) continue;
          if (row.running || row.pending !== undefined || row.completed) continue;
          if (row.id === currentId || unseen.has(row.id)) continue;
          if (row.updatedAtMs <= 0 || now - row.updatedAtMs <= days * DAY_MS) continue;
          if (attempted.current.has(row.id)) continue;
          attempted.current.add(row.id);
          Promise.resolve(archiveSession(row.id)).catch(() => {});
        }
      }, [rows, clock, currentId, unseen, settings.autoArchiveDays, archiveSession]);

      const open = (row) => {
        if (row.archived) return;
        cancelAutoClear(row.id);
        forget(row.id);
        openSession(row.id);
      };

      const active = rows.filter((row) => !row.archived);
      const archivedRows = rows.filter((row) => row.archived);
      const attention = active.filter((row) => statusOf(row, unseen.has(row.id), t) !== undefined).length;

      const styles = h('style', { key: 'styles' }, css);

      if (!wide) {
        return h(
          React.Fragment,
          null,
          styles,
          h(
            'button',
            {
              key: 'rail',
              type: 'button',
              className: 'dsh-shelves-rail',
              'aria-label': t('rail.expand'),
              title: t('rail.expand'),
              onClick: expandSidebar,
            },
            h('span', { key: `n-${attention}`, className: 'dsh-shelves-anim' }, String(attention)),
          ),
        );
      }

      // Archive is the Host's own durable state, so it survives reloads and reaches
      // every client. A Session with running work refuses the plain archive; the
      // refusal is left as-is instead of driving a stop-and-archive flow.
      const toggleArchive = (row) => {
        const run = row.archived ? unarchiveSession(row.id) : archiveSession(row.id);
        Promise.resolve(run).catch(() => {});
      };

      const togglePin = (row) => {
        const next = { ...pinned };
        if (next[row.id] === undefined) next[row.id] = Date.now();
        else delete next[row.id];
        updatePinned(next);
      };

      const renderRow = (row) => {
        const selected = row.id === currentId && !panelActive;
        const title = row.blank ? t('session.new') : row.title || t('session.untitled');
        const status = row.archived ? undefined : statusOf(row, unseen.has(row.id), t);
        const time = relativeTime(row.updatedAtMs, Date.now(), t);
        const classes = ['dsh-shelves-row'];
        if (selected) classes.push('dsh-shelves-row-selected');
        if (row.archived) classes.push('dsh-shelves-row-archived');
        return h(
          'div',
          {
            key: row.id,
            className: classes.join(' '),
            role: 'button',
            tabIndex: row.archived ? -1 : 0,
            'aria-current': selected ? 'true' : undefined,
            'aria-disabled': row.archived ? 'true' : undefined,
            title,
            onClick: () => open(row),
            onKeyDown: (event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              open(row);
            },
          },
          h(
            'span',
            { className: 'dsh-shelves-titleline' },
            status === undefined
              ? null
              : h(
                  'span',
                  {
                    key: status.key,
                    className: `dsh-shelves-status dsh-shelves-status-${status.tone} dsh-shelves-anim`,
                    role: 'img',
                    'aria-label': status.label,
                    title: status.label,
                  },
                  glyph(status.key, 13),
                ),
            h('span', { className: 'dsh-shelves-title' }, title),
            time === '' ? null : h('span', { className: 'dsh-shelves-time' }, time),
          ),
          h(
            'span',
            { className: 'dsh-shelves-metaline' },
            row.pinned
              ? h(
                  'span',
                  { className: 'dsh-shelves-pin', role: 'img', 'aria-label': t('action.pin'), title: t('action.pin') },
                  glyph('pin', 12),
                )
              : null,
            h('span', { className: 'dsh-shelves-ws' }, row.workspace),
            terminalSessions.has(row.id)
              ? h(
                  'span',
                  { className: 'dsh-shelves-term', role: 'img', 'aria-label': t('terminal.open'), title: t('terminal.open') },
                  glyph('terminal', 13),
                )
              : null,
          ),
          h(
            'span',
            { className: 'dsh-shelves-actions' },
            h(
              'button',
              {
                type: 'button',
                className: row.pinned ? 'dsh-shelves-action dsh-shelves-action-pinned' : 'dsh-shelves-action',
                'aria-label': row.pinned ? t('action.unpin') : t('action.pin'),
                title: row.pinned ? t('action.unpin') : t('action.pin'),
                onClick: (event) => {
                  event.stopPropagation();
                  togglePin(row);
                },
              },
              glyph('pin', 15),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'dsh-shelves-action',
                'aria-label': row.archived ? t('action.unarchive') : t('action.archive'),
                title: row.archived ? t('action.unarchive') : t('action.archive'),
                onClick: (event) => {
                  event.stopPropagation();
                  toggleArchive(row);
                },
              },
              glyph(row.archived ? 'unarchive' : 'archive', 15),
            ),
          ),
        );
      };

      const renderShelfHeader = (key, label, count, open, toggle, accessory) =>
        h(
          'div',
          { key, className: 'dsh-shelves-headrow' },
          h(
            'button',
            { type: 'button', className: 'dsh-shelves-head', 'aria-expanded': open ? 'true' : 'false', onClick: toggle },
            h('span', { className: open ? 'dsh-shelves-chevron dsh-shelves-chevron-open' : 'dsh-shelves-chevron' }, glyph('chevron', 14)),
            h('span', null, label),
            h('span', { key: `count-${count}`, className: 'dsh-shelves-count dsh-shelves-anim' }, String(count)),
          ),
          accessory ?? null,
        );

      const stack = [];
      if (rows.length === 0) {
        stack.push(h('div', { key: 'empty', className: 'dsh-shelves-empty' }, t('shelf.empty')));
      } else {
        for (const row of active) stack.push(renderRow(row));

        const bottom = [];
        bottom.push(
          renderShelfHeader(
            'archived',
            t('shelf.archived'),
            archivedRows.length,
            archivedOpen,
            () => setArchivedOpen(!archivedOpen),
            h(
              'button',
              {
                type: 'button',
                className: 'dsh-shelves-gear',
                'aria-label': t('settings.label'),
                'aria-expanded': settingsOpen ? 'true' : 'false',
                title: t('settings.label'),
                onClick: () => setSettingsOpen(!settingsOpen),
              },
              glyph('gear', 14),
            ),
          ),
        );
        if (settingsOpen) {
          bottom.push(
            h(
              'div',
              { key: 'settings', className: 'dsh-shelves-settings' },
              h('div', { className: 'dsh-shelves-settings-title' }, t('settings.label')),
              h(
                'div',
                { className: 'dsh-shelves-setting' },
                h('span', null, t('settings.autoArchive')),
                h(
                  'span',
                  { className: 'dsh-shelves-select' },
                  h(
                    'select',
                    {
                      'aria-label': t('settings.autoArchive'),
                      value: settings.autoArchiveDays === null ? '' : String(settings.autoArchiveDays),
                      onChange: (event) =>
                        updateSettings({ autoArchiveDays: event.target.value === '' ? null : Number(event.target.value) }),
                    },
                    h('option', { value: '' }, t('settings.off')),
                    AUTO_ARCHIVE_CHOICES.map((days) => h('option', { key: days, value: String(days) }, t('settings.days', { n: days }))),
                  ),
                  h('span', { className: 'dsh-shelves-select-chevron' }, glyph('chevron', 12)),
                ),
              ),
            ),
          );
        }
        if (archivedOpen) for (const row of archivedRows) bottom.push(renderRow(row));

        stack.push(h('div', { key: 'bottom', className: 'dsh-shelves-bottom' }, bottom));
      }

      return h(
        React.Fragment,
        null,
        styles,
        h('div', { key: 'root', className: 'dsh-shelves-root' }, h('div', { className: 'dsh-shelves-scroll' }, h('div', { className: 'dsh-shelves-stack' }, stack))),
      );
    }

    return {
      inject: ['slots', 'locale', 'uiWorkspace'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'sidebar-shelves: dictionaries');
        ctx.slots.inject('sidebar.workspaces', () =>
          ctx.slots.register(
            {
              name: 'sidebar.workspaces',
              priority: -1,
              locale: NS,
              inject: () => ({
                openSession: (id) => ctx.uiWorkspace.openSession(id),
                archiveSession: (id) => ctx.uiWorkspace.archiveSession(id),
                unarchiveSession: (id) => ctx.uiWorkspace.unarchiveSession(id),
                getOpenTabs: () => ctx.get('sidebarRight')?.openTabs,
              }),
            },
            Shelves,
          ),
        );
      },
    };
  },
});
