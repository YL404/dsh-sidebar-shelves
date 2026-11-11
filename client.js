/**
 * Client half: replaces the `sidebar.workspaces` occupant with a t3code-style
 * session list.
 *
 * Unarchived sessions flow from the top of the column, newest input first with
 * pinned ones leading; the Archived shelf is pushed to the bottom. Each session
 * is a two-line card — a status icon in a fixed slot, the title, and its
 * relative time, then the Workspace's project tile, the pin, its name, and the
 * terminal marker. The tile follows t3code: a name-derived monogram and color,
 * replaced by the emoji, color, or workspace image file the user picks.
 *
 * Archiving uses the Host's own durable state, never a derived status: a
 * session leaves the list only when the user archives it. Pinning is local and
 * independent of archiving.
 *
 * A card's context menu mirrors the native Session menu where the running DSH
 * offers the same verbs: pin, rename, fork, copy the Session id, and archive.
 *
 * The composer's workspace menu is the second occupant: it draws each Workspace
 * with the same project tile and orders them by their newest session, so the
 * sidebar and the picker share one icon set and one recency rule. The third is
 * the conversation header's leading seat, which carries the open Session's
 * Workspace tile just before its title.
 */
window.__ModuleLoader__.load({
  id: 'dsh-sidebar-shelves',
  factory(require) {
    const React = require('react');
    const { Button, IconPlusOutlineRegular, Menu, Modal, Toast, writeClipboard } = require('@deepseek-ai/dsh-client-ui-primitives');
    const h = React.createElement;
    const NS = 'dsh.sidebarShelves';

    const ADD_WORKSPACE = '::add-workspace';
    const DAY_MS = 86400000;
    const AUTO_CLEAR_MS = 2500;
    const SETTINGS_KEY = 'dsh:sidebar-shelves:settings';
    const PINNED_KEY = 'dsh:sidebar-shelves:pinned';
    const ICONS_KEY = 'dsh:sidebar-shelves:icons';
    // Collapsed workspace groups in the tree view; keys are workspace ids, with
    // '' for the no-workspace bucket.
    const COLLAPSED_KEY = 'dsh:sidebar-shelves:collapsed';
    // Mirrors the Host half's projection key; the Host folds owned jobs there.
    const JOB_ACTIVITY_KEY = 'sidebarShelvesJobActivity';
    const AUTO_ARCHIVE_CHOICES = [3, 7, 14, 30];
    // The settings panel floats over the column instead of joining its flow, so
    // its box is placed from the gear's own rect.
    const SETTINGS_POPOVER_WIDTH = 232;

    // t3code's project palette: the same name always lands on the same slot, so a
    // project keeps its color without anything being stored. Light mode uses the
    // 600 step and dark mode the 400 step, matching t3code's own Tailwind classes.
    const PROJECT_COLORS = [
      ['gray', '#4b5563', '#9ca3af'],
      ['red', '#dc2626', '#f87171'],
      ['orange', '#ea580c', '#fb923c'],
      ['amber', '#d97706', '#fbbf24'],
      ['yellow', '#ca8a04', '#facc15'],
      ['lime', '#65a30d', '#a3e635'],
      ['green', '#16a34a', '#4ade80'],
      ['emerald', '#059669', '#34d399'],
      ['teal', '#0d9488', '#2dd4bf'],
      ['cyan', '#0891b2', '#22d3ee'],
      ['sky', '#0284c7', '#38bdf8'],
      ['blue', '#2563eb', '#60a5fa'],
      ['indigo', '#4f46e5', '#818cf8'],
      ['violet', '#7c3aed', '#a78bfa'],
      ['purple', '#9333ea', '#c084fc'],
      ['fuchsia', '#c026d3', '#e879f9'],
      ['pink', '#db2777', '#f472b6'],
      ['rose', '#e11d48', '#fb7185'],
    ];
    const PROJECT_EMOJIS = [
      '💻', '🛠️', '🚀', '🤖', '✨', '⚡', '🌐', '📱',
      '🖥️', '⌨️', '⚙️', '🗄️', '☁️', '📦', '📚', '🧪',
      '🔒', '🎮', '🎵', '🎬', '🖼️', '🛍️', '🔥', '💡',
    ];
    // Image files a Workspace icon may name, and the cap one may weigh.
    const ICON_MIME = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
      svg: 'image/svg+xml',
      ico: 'image/x-icon',
      avif: 'image/avif',
      bmp: 'image/bmp',
    };
    const MAX_ICON_BYTES = 2 * 1024 * 1024;
    // An Icon Composer package is a folder, not an image: icon.json names the
    // background and the layer assets, which are composited on a canvas.
    const ICON_CANVAS = 256;
    const ICON_SPEC_BYTES = 256 * 1024;
    // One object URL per Workspace file, shared by every row and the picker.
    const ICON_URLS = new Map();
    const ICON_LOADS = new Map();

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
      'settings.view': '视图',
      'settings.view.flat': '平铺（按时间）',
      'settings.view.tree': '按工作区分组',
      'group.unspecified': '未指定工作区',
      'action.archive': '归档会话',
      'action.unarchive': '取消归档',
      'action.pin': '置顶会话',
      'action.unpin': '取消置顶',
      'action.rename': '重命名…',
      'action.fork': '分叉会话',
      'action.copyId': '复制会话 ID',
      'action.copyIdDone': '已复制会话 ID',
      'action.copyIdFailed': '复制会话 ID 失败',
      'action.forkFailed': '无法分叉会话',
      'action.removeProject': '移除项目',
      'remove.title': '移除项目',
      'remove.desc': '将把“{name}”从侧边栏的项目中移除。文件夹与会话记录会保留，其会话将显示为未分组。',
      'remove.pending': '正在移除项目…',
      'remove.confirm': '移除',
      'remove.cancel': '取消',
      'remove.done': '已移除项目',
      'rename.title': '重命名会话',
      'rename.confirm': '确定',
      'rename.cancel': '取消',
      'rename.empty': '标题不能为空',
      'menu.addWorkspace': '添加工作区…',
      'menu.addFailed': '无法添加工作区',
      'menu.addRetry': '重试',
      'menu.close': '关闭',
      'icon.edit': '更改项目图标',
      'icon.auto': '自动',
      'icon.file': '选择文件…',
      'file.title': '选择图标文件',
      'file.cancel': '取消',
      'file.pick': '使用此图标',
      'file.hint': '选一个方形图标',
      'file.search': '搜索图标…',
      'file.scanning': '正在扫描工作区…',
      'file.checking': '正在检查尺寸 {done}/{total}',
      'file.count': '{n} 个方形图标',
      'file.empty': '工作区里没有方形图标',
      'file.noMatch': '没有匹配的图标',
      'status.working': '工作中',
      'status.approval': '待审批',
      'status.planReview': '待确认',
      'status.answer': '待回答',
      'status.done': '已完成',
      'activity.jobs.one': '{n} 个后台任务在运行',
      'activity.jobs.other': '{n} 个后台任务在运行',
      'activity.subagents.one': '{n} 个子代理正在工作',
      'activity.subagents.other': '{n} 个子代理正在工作',
      'activity.detail': '：{items}',
      'activity.comma': '、',
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
      'settings.view': 'View',
      'settings.view.flat': 'Flat list',
      'settings.view.tree': 'Group by workspace',
      'group.unspecified': 'No workspace',
      'action.archive': 'Archive session',
      'action.unarchive': 'Unarchive session',
      'action.pin': 'Pin session',
      'action.unpin': 'Unpin session',
      'action.rename': 'Rename…',
      'action.fork': 'Fork session',
      'action.copyId': 'Copy Session ID',
      'action.copyIdDone': 'Session ID copied',
      'action.copyIdFailed': 'Could not copy Session ID',
      'action.forkFailed': 'Could not fork session',
      'action.removeProject': 'Remove project',
      'remove.title': 'Remove project',
      'remove.desc': 'This removes “{name}” from the sidebar projects. The folder and its sessions are kept; its sessions become ungrouped.',
      'remove.pending': 'Removing project…',
      'remove.confirm': 'Remove',
      'remove.cancel': 'Cancel',
      'remove.done': 'Project removed',
      'rename.title': 'Rename session',
      'rename.confirm': 'Rename',
      'rename.cancel': 'Cancel',
      'rename.empty': 'Title cannot be empty',
      'menu.addWorkspace': 'Add workspace…',
      'menu.addFailed': 'Could not add workspace',
      'menu.addRetry': 'Try again',
      'menu.close': 'Close',
      'icon.edit': 'Change project icon',
      'icon.auto': 'Auto',
      'icon.file': 'Choose file…',
      'file.title': 'Choose an icon file',
      'file.cancel': 'Cancel',
      'file.pick': 'Use this icon',
      'file.hint': 'Pick a square icon',
      'file.search': 'Search icons…',
      'file.scanning': 'Scanning the workspace…',
      'file.checking': 'Checking sizes {done}/{total}',
      'file.count': '{n} square icons',
      'file.empty': 'No square icons in this workspace',
      'file.noMatch': 'No matching icons',
      'status.working': 'Working',
      'status.approval': 'Approval',
      'status.planReview': 'Plan review',
      'status.answer': 'Answer',
      'status.done': 'Done',
      'activity.jobs.one': '{n} background job running',
      'activity.jobs.other': '{n} background jobs running',
      'activity.subagents.one': '{n} subagent working',
      'activity.subagents.other': '{n} subagents working',
      'activity.detail': ': {items}',
      'activity.comma': ', ',
      'terminal.open': 'Terminal open',
      'time.now': 'now',
    };

    const css = [
      '.dsh-shelves-root{display:flex;flex-direction:column;flex:1 1 auto;min-height:0}',
      '.dsh-shelves-scroll{display:flex;flex-direction:column;flex:1 1 auto;min-height:0;overflow-y:auto;scrollbar-width:none;-ms-overflow-style:none}',
      '.dsh-shelves-scroll::-webkit-scrollbar{display:none;width:0;height:0}',
      '.dsh-shelves-stack{display:flex;flex:1 1 auto;flex-direction:column;gap:2px;padding:6px 4px 10px}',
      '.dsh-shelves-bottom{display:flex;flex-direction:column;gap:2px;margin-top:auto;padding-top:6px;border-top:1px solid var(--dsw-alias-border-l1)}',
      '.dsh-shelves-archived-list{display:flex;flex-direction:column;gap:2px;max-height:min(360px,42vh);overflow-y:auto;overscroll-behavior:contain;scrollbar-width:none;-ms-overflow-style:none}',
      '.dsh-shelves-archived-list::-webkit-scrollbar{display:none;width:0;height:0}',
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
      '.dsh-shelves-settings{position:fixed;z-index:60;display:flex;flex-direction:column;box-sizing:border-box;padding:8px 10px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-overlay);box-shadow:0 10px 28px #00000033}',
      '.dsh-shelves-settings-title{margin-bottom:2px;font-size:11px;font-weight:500;letter-spacing:.03em;color:var(--dsw-alias-label-secondary)}',
      '.dsh-shelves-setting{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:28px;font-size:12px;color:var(--dsw-alias-label-primary)}',
      '.dsh-shelves-select{position:relative;display:inline-flex;align-items:center}',
      '.dsh-shelves-select>select{appearance:none;-webkit-appearance:none;height:24px;padding:0 20px 0 8px;border:0;border-radius:6px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;cursor:pointer}',
      '.dsh-shelves-select>select:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.dsh-shelves-select-chevron{position:absolute;right:5px;display:inline-flex;pointer-events:none;color:var(--dsw-alias-label-secondary);transform:rotate(90deg)}',
      '.dsh-shelves-row{position:relative;display:flex;box-sizing:border-box;flex-direction:column;justify-content:center;width:100%;min-height:56px;padding:5px 10px;border-radius:8px;color:var(--dsw-alias-label-primary);font-size:14px;text-align:left;cursor:pointer;user-select:none}',
      '.dsh-shelves-row:hover{background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2))}',
      '.dsh-shelves-row:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}',
      '.dsh-shelves-row-selected{background:var(--dsw-specific-sidebar-nav-item-active,var(--dsw-alias-bg-layer-2))}',
      '.dsh-shelves-titleline{display:flex;align-items:center;gap:6px;min-width:0;min-height:22px}',
      '.dsh-shelves-title{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500}',
      '.dsh-shelves-title-done{font-weight:700}',
      '.dsh-shelves-row-archived .dsh-shelves-title{font-weight:400;color:var(--dsw-alias-label-secondary)}',
      '.dsh-shelves-metaline{display:flex;align-items:center;gap:6px;min-width:0;min-height:16px;margin-top:2px;font-size:12px;font-weight:400;color:var(--dsw-alias-label-secondary)}',
      '.dsh-shelves-ws{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dsh-shelves-badge{display:inline-flex;flex:none;align-items:center;gap:2px;height:15px;padding:0 4px 0 3px;border-radius:4px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 8%,transparent);color:var(--dsw-alias-label-secondary);font-size:10px;line-height:15px;font-variant-numeric:tabular-nums}',
      '.dsh-shelves-badge svg{display:block;flex:none}',
      '.dsh-shelves-badge-jobs{color:var(--dsw-alias-brand-primary)}',
      '.dsh-shelves-badge-subagents{color:var(--dsw-alias-state-business-primary)}',
      '.dsh-shelves-badge-n{color:var(--dsw-alias-label-secondary)}',
      '.dsh-shelves-term{display:inline-flex;flex:none;align-items:center;color:var(--dsw-alias-state-business-primary)}',
      '.dsh-shelves-time{margin-left:auto;flex:none;font-size:12px;font-variant-numeric:tabular-nums;opacity:.7;transition:opacity .12s ease}',
      // A working session's time carries the same brand color as its spinner, so
      // the row reads as live without a second kind of accent.
      '.dsh-shelves-time-running{color:var(--dsw-alias-brand-primary);font-weight:500;opacity:1}',
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
      '.dsh-shelves-proj,.dsh-shelves-menuproj,.dsh-shelves-headtile{display:inline-flex;flex:none;align-items:center;justify-content:center;box-sizing:border-box;width:14px;height:14px;margin:0;padding:0;border:0;border-radius:22%;overflow:hidden;background:color-mix(in srgb,var(--dsh-pi) 14%,transparent);color:var(--dsh-pi);font:inherit}',
      '.dsh-shelves-proj{cursor:pointer}',
      '.dsh-shelves-proj:hover{background:color-mix(in srgb,var(--dsh-pi) 26%,transparent)}',
      // An emoji carries its own color, so its tile drops the tinted chip and
      // keeps only a neutral hover.
      '.dsh-shelves-proj:has(.dsh-shelves-proj-emoji),.dsh-shelves-menuproj:has(.dsh-shelves-proj-emoji),.dsh-shelves-headtile:has(.dsh-shelves-proj-emoji){background:transparent}',
      '.dsh-shelves-proj:has(.dsh-shelves-proj-emoji):hover{background:var(--dsw-alias-bg-layer-2)}',
      '.dsh-shelves-proj:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.dsh-shelves-proj svg,.dsh-shelves-menuproj svg{display:block;width:14px;height:14px}',
      '.dsh-shelves-proj text,.dsh-shelves-menuproj text,.dsh-shelves-headtile text{font-family:var(--dsh-font-family-code,ui-monospace,monospace)}',
      '.dsh-shelves-proj-emoji{font-size:11px;line-height:1}',
      // The header tile leads the Session title, so it takes the title's scale.
      '.dsh-shelves-headtile{width:16px;height:16px}',
      '.dsh-shelves-headtile svg,.dsh-shelves-headtile .dsh-shelves-proj-img{display:block;width:16px;height:16px}',
      '.dsh-shelves-headtile .dsh-shelves-proj-emoji{font-size:12px}',
      '.dsh-shelves-group-title{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dsh-shelves-group-body{display:flex;flex-direction:column;gap:2px;margin-left:7px;padding-left:10px;border-left:1px solid var(--dsw-alias-border-l1)}',
      // Collapsed on macOS the frame's chrome (traffic lights, the two reopen
      // controls) owns the band the header starts in, and the title row pads
      // itself past that band. The tile keeps its 16px of flow but draws it
      // after the band, so the title simply moves past the tile instead of the
      // tile landing under the chrome. The two margins cancel to one tile
      // width, which is why the title shifts by 16px and no more.
      "html[data-platform='darwin'] [data-sidebar-collapsed] .dsh-shelves-headtile{margin-inline-start:max(0px,calc(var(--dsh-frame-leading-clearance,0px) - 20px));margin-inline-end:min(0px,calc(20px - var(--dsh-frame-leading-clearance,0px)))}",
      ...PROJECT_COLORS.flatMap(([name, light, dark]) => [
        `.dsh-shelves-pi-${name}{--dsh-pi:${light}}`,
        `body[data-ds-dark-theme] .dsh-shelves-pi-${name}{--dsh-pi:${dark}}`,
      ]),
      '.dsh-shelves-iconpicker{position:fixed;z-index:60;display:flex;flex-direction:column;gap:6px;box-sizing:border-box;width:200px;padding:8px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-overlay);box-shadow:0 10px 28px #00000033}',
      '.dsh-shelves-iconpicker-head{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0;font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.dsh-shelves-iconpicker-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dsh-shelves-iconpicker-auto{flex:none;height:20px;padding:0 6px;border:0;border-radius:5px;background:transparent;color:var(--dsw-alias-brand-primary);font:inherit;font-size:11px;cursor:pointer}',
      '.dsh-shelves-iconpicker-auto:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.dsh-shelves-iconpicker-auto:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.dsh-shelves-swatches{display:grid;grid-template-columns:repeat(9,16px);justify-content:space-between;gap:4px 0}',
      '.dsh-shelves-swatch{width:16px;height:16px;padding:0;border:0;border-radius:50%;background:var(--dsh-pi);opacity:.8;cursor:pointer}',
      '.dsh-shelves-swatch:hover{opacity:1;transform:scale(1.12)}',
      '.dsh-shelves-swatch:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.dsh-shelves-swatch-on{opacity:1;box-shadow:0 0 0 2px var(--dsw-alias-bg-overlay),0 0 0 3px var(--dsh-pi)}',
      '.dsh-shelves-emojis{display:grid;grid-template-columns:repeat(8,22px);justify-content:space-between;gap:2px 0}',
      '.dsh-shelves-emojis>button{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;padding:0;border:0;border-radius:5px;background:transparent;font-size:14px;line-height:1;cursor:pointer}',
      '.dsh-shelves-emojis>button:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.dsh-shelves-emojis>button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-1px}',
      '.dsh-shelves-emojis>button[aria-pressed="true"]{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 18%,transparent)}',
      '.dsh-shelves-proj-img{display:block;width:14px;height:14px;object-fit:contain}',
      '.dsh-shelves-iconpicker-file{display:flex;align-items:center;gap:6px;width:100%;box-sizing:border-box;height:26px;padding:0 6px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;cursor:pointer}',
      '.dsh-shelves-iconpicker-file:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.dsh-shelves-iconpicker-file:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}',
      '.dsh-shelves-files{position:fixed;inset:0;z-index:70;display:flex;align-items:center;justify-content:center;padding:24px;background:#00000066}',
      '.dsh-shelves-files-panel{display:flex;flex-direction:column;box-sizing:border-box;width:min(560px,100%);height:min(440px,100%);overflow:hidden;border:1px solid var(--dsw-alias-border-l1);border-radius:14px;background:var(--dsw-alias-bg-overlay);box-shadow:0 18px 48px #00000040}',
      '.dsh-shelves-files-head{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid var(--dsw-alias-border-l1)}',
      '.dsh-shelves-files-title{flex:none;font-size:13px;font-weight:600}',
      '.dsh-shelves-files-name{margin-left:auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:var(--dsw-alias-label-secondary)}',
      '.dsh-shelves-files-toolbar{display:flex;align-items:center;gap:10px;padding:8px 14px;border-bottom:1px solid var(--dsw-alias-border-l1)}',
      '.dsh-shelves-files-search{display:flex;flex:1 1 auto;align-items:center;gap:6px;height:30px;padding:0 8px;border-radius:7px;background:var(--dsw-alias-bg-layer-2)}',
      '.dsh-shelves-files-search input{flex:1 1 auto;min-width:0;border:0;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;outline:none}',
      '.dsh-shelves-files-search input::placeholder{color:var(--dsw-alias-label-secondary)}',
      '.dsh-shelves-files-status{flex:none;font-size:11px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}',
      '.dsh-shelves-files-glyph{display:inline-flex;flex:none;align-items:center;color:var(--dsw-alias-label-secondary)}',
      '.dsh-shelves-files-rows{flex:1 1 auto;min-height:0;overflow-y:auto;padding:10px 12px}',
      '.dsh-shelves-files-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(76px,1fr));gap:6px}',
      '.dsh-shelves-files-cell{display:flex;flex-direction:column;align-items:center;gap:4px;min-width:0;padding:4px;border:0;border-radius:10px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;cursor:pointer}',
      '.dsh-shelves-files-cell:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.dsh-shelves-files-cell:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}',
      '.dsh-shelves-files-cell[aria-selected="true"]{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 18%,transparent)}',
      '.dsh-shelves-files-cell[aria-selected="true"] .dsh-shelves-files-thumb{box-shadow:0 0 0 2px var(--dsw-alias-brand-primary)}',
      '.dsh-shelves-files-thumb{display:flex;flex:none;align-items:center;justify-content:center;width:56px;height:56px;overflow:hidden;border-radius:22%;background:var(--dsw-alias-bg-layer-2)}',
      '.dsh-shelves-files-thumb img{display:block;width:100%;height:100%;object-fit:contain}',
      '.dsh-shelves-files-cell-name{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px;color:var(--dsw-alias-label-secondary)}',
      '.dsh-shelves-files-cell[aria-selected="true"] .dsh-shelves-files-cell-name{color:var(--dsw-alias-label-primary)}',
      '.dsh-shelves-files-selected{margin-right:auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.dsh-shelves-files-empty{padding:16px 10px;font-size:12px;color:var(--dsw-alias-label-secondary)}',
      '.dsh-shelves-files-foot{display:flex;justify-content:flex-end;gap:8px;padding:10px 14px;border-top:1px solid var(--dsw-alias-border-l1)}',
      '.dsh-shelves-files-btn{flex:none;height:28px;padding:0 12px;border:0;border-radius:7px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;white-space:nowrap;cursor:pointer}',
      '.dsh-shelves-files-btn:hover{background:color-mix(in srgb,var(--dsw-alias-label-primary) 12%,var(--dsw-alias-bg-layer-2))}',
      '.dsh-shelves-files-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.dsh-shelves-files-btn:disabled{opacity:.45;cursor:default}',
      '.dsh-shelves-files-btn-primary{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-base)}',
      '.dsh-shelves-files-btn-primary:hover{background:color-mix(in srgb,var(--dsw-alias-label-primary) 86%,var(--dsw-alias-bg-base))}',
      '.dsh-shelves-rename{display:flex;flex-direction:column;gap:6px}',
      '.dsh-shelves-rename input{box-sizing:border-box;width:100%;height:34px;padding:0 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;outline:none}',
      '.dsh-shelves-rename input:focus{border-color:var(--dsw-alias-brand-primary)}',
      '.dsh-shelves-rename-error{font-size:12px;color:var(--dsw-alias-state-error-primary)}',
      '.dsh-shelves-remove{display:flex;flex-direction:column;gap:8px;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-primary)}',
      '.dsh-shelves-remove-pending{font-size:12px;color:var(--dsw-alias-label-secondary)}',
      '.dsh-shelves-remove-error{font-size:12px;color:var(--dsw-alias-state-error-primary)}',
      '.dsh-shelves-danger{color:var(--dsw-alias-state-error-primary)}',
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
      jobs: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7.5V12l3 2',
      robot: 'M9 3.5v2M15 3.5v2M5 6.5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2zM8 11h1.5M14.5 11H16M9.5 14.5h5',
      chevron: 'M9 6l6 6-6 6',
      gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15H2.9a2 2 0 1 1 0-4H3a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 4.1V4a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 11h.1a2 2 0 1 1 0 4H21a1.7 1.7 0 0 0-1.6 1z',
      pin: 'M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z',
      unarchive: 'M3.5 5.5h17v3.5h-17zM5.5 9v9.5h13V9M12 15.5V10M9.5 12.5l2.5-2.5 2.5 2.5',
      rename: 'M4 20h4l9.5-9.5a2.1 2.1 0 0 0-3-3L5 17v3zM13.5 6.5l4 4',
      fork: 'M6 4v9M6 19a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM18 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM18 9c0 4.5-4 5-8 5.5',
      copy: 'M9 9h10v10H9zM5 15V5h10',
      image: 'M3.5 5.5h17v13h-17zM7 14.5l3.5-3.5 3 3 2-2 2 2M8 9.5h.01',
      search: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM15.5 15.5L20 20',
      trash: 'M4 7h16M9.5 7V5h5v2M6.5 7l.8 12.5h9.4L17.5 7M10 11v5M14 11v5',
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

    // One module-level store per persisted choice, so two surfaces (the sidebar
    // and the composer menu) read the same value and see each other's writes
    // without a reload.
    function createJsonStore(key) {
      let value = readJson(key, {});
      const listeners = new Set();
      return {
        get: () => value,
        subscribe: (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        set: (next) => {
          value = next;
          writeJson(key, next);
          for (const listener of listeners) listener();
        },
      };
    }

    const iconsStore = createJsonStore(ICONS_KEY);

    function normalizeSettings(raw) {
      return {
        autoArchiveDays: typeof raw.autoArchiveDays === 'number' ? raw.autoArchiveDays : null,
        view: raw.view === 'flat' ? 'flat' : 'tree',
      };
    }

    function normalizeMap(raw) {
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

    function workspaceIndex(items) {
      const bySession = new Map();
      for (const workspace of items ?? []) {
        for (const id of workspace.sessionIds ?? []) {
          if (!bySession.has(id)) bySession.set(id, workspace);
        }
      }
      return bySession;
    }

    function workspaceIconName(workspace) {
      const title = (workspace.title ?? '').trim();
      if (title !== '') return title;
      const path = (workspace.path ?? '').replace(/[\\/]+$/, '');
      const base = path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1);
      return base.trim() === '' ? 'project' : base.trim();
    }

    // t3code's monogram: the first letter of the first word, then the first digit
    // after it, else the last word's first letter, else the first word's last letter.
    function projectMonogram(name) {
      const words = name.normalize('NFKC').trim().match(/[\p{L}\p{N}]+/gu) ?? [];
      const firstWord = words[0];
      if (firstWord === undefined) return 'PR';
      const glyphs = Array.from(firstWord);
      const first = glyphs[0] ?? 'P';
      const second =
        glyphs.slice(1).find((glyph) => /\p{N}/u.test(glyph)) ??
        (words.length > 1 ? Array.from(words[words.length - 1] ?? '')[0] : glyphs[glyphs.length - 1]) ??
        first;
      return Array.from(`${first}${second}`.toUpperCase()).slice(0, 2).join('');
    }

    // t3code's color: the same name always lands on the same palette slot, so a
    // project keeps its color with nothing stored.
    function projectColor(name) {
      const seed = name.normalize('NFKC').trim().toLocaleLowerCase('en-US') || 'project';
      let index = 0;
      for (const glyph of seed) {
        index = (index * 31 + (glyph.codePointAt(0) ?? 0)) % PROJECT_COLORS.length;
      }
      return PROJECT_COLORS[index]?.[0] ?? 'blue';
    }

    // An explicit choice wins over the automatic identity, the way t3code resolves
    // a project's icon: a chosen image, then an emoji, then the name-derived
    // monogram and color.
    function projectIcon(name, override) {
      const picked = override?.color;
      const color = PROJECT_COLORS.some(([value]) => value === picked) ? picked : projectColor(name);
      const file = typeof override?.file === 'string' ? override.file : '';
      return {
        color,
        file,
        emoji: file === '' && typeof override?.emoji === 'string' ? override.emoji : '',
        text: projectMonogram(name),
      };
    }

    function iconMime(name) {
      const dot = name.lastIndexOf('.');
      return dot < 0 ? null : (ICON_MIME[name.slice(dot + 1).toLowerCase()] ?? null);
    }

    function formatBytes(bytes) {
      if (typeof bytes !== 'number' || bytes <= 0) return '';
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    function currentAppearance() {
      return document.body?.hasAttribute('data-ds-dark-theme') === true ? 'dark' : 'light';
    }

    // The theme flips an attribute on <body>; package icons carry a layer set per
    // appearance, so the tiles follow it without a reload.
    const appearanceListeners = new Set();
    let appearanceObserver = null;

    function subscribeAppearance(onChange) {
      if (appearanceObserver === null) {
        appearanceObserver = new MutationObserver(() => {
          for (const listener of appearanceListeners) listener();
        });
        appearanceObserver.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] });
      }
      appearanceListeners.add(onChange);
      return () => appearanceListeners.delete(onChange);
    }

    function useAppearance() {
      return React.useSyncExternalStore(subscribeAppearance, currentAppearance);
    }

    // A package icon keeps one render per appearance, because its layers can differ.
    function iconKey(workspaceId, file, appearance) {
      return file.endsWith('.icon') ? `${workspaceId}:${file}:${appearance}` : `${workspaceId}:${file}`;
    }

    // The system's dark canvas material, sampled from an ictool render: a near-black
    // vertical shade rather than the package's custom fill.
    const DARK_CANVAS_TOP = '#2a2a2c';
    const DARK_CANVAS_BOTTOM = '#101011';

    function parseIconColor(value) {
      if (typeof value !== 'string') return null;
      const colon = value.indexOf(':');
      if (colon < 0) return null;
      const space = value.slice(0, colon);
      const parts = value.slice(colon + 1).split(',').map(Number);
      if (parts.some((part) => !Number.isFinite(part))) return null;
      if (space === 'gray' || space === 'extended-gray') {
        const [level, alpha = 1] = parts;
        const channel = Math.round(Math.min(1, Math.max(0, level)) * 255);
        return `rgba(${channel}, ${channel}, ${channel}, ${alpha})`;
      }
      if (space !== 'srgb' && space !== 'display-p3' && space !== 'extended-srgb') return null;
      if (parts.length < 3) return null;
      const [red, green, blue, alpha = 1] = parts;
      const channel = (part) => Math.round(Math.min(1, Math.max(0, part)) * 255);
      return `rgba(${channel(red)}, ${channel(green)}, ${channel(blue)}, ${alpha})`;
    }

    function darkCanvasFill(context, size) {
      const gradient = context.createLinearGradient(0, 0, 0, size);
      gradient.addColorStop(0, DARK_CANVAS_TOP);
      gradient.addColorStop(1, DARK_CANVAS_BOTTOM);
      return gradient;
    }

    // The base fill describes the Default appearance. A dark appearance without its
    // own specialization falls back to the system's automatic fill, which is why a
    // blue package renders black in dark mode.
    function resolveCanvasFill(spec, appearance) {
      const entries = Array.isArray(spec['fill-specializations']) ? spec['fill-specializations'] : [];
      let value = spec.fill ?? 'automatic';
      for (const entry of entries) {
        if (entry === null || typeof entry !== 'object') continue;
        if (entry.appearance !== undefined && entry.appearance !== appearance) continue;
        value = entry.value;
      }
      if (appearance === 'dark' && !entries.some((entry) => entry?.appearance === 'dark')) return 'automatic';
      return value;
    }

    function canvasFillStyle(context, value, size, appearance) {
      if (typeof value === 'string') {
        if (value === 'system-light') return '#ffffff';
        if (value === 'system-dark') return darkCanvasFill(context, size);
        // 'automatic' and 'none' follow the system appearance.
        return appearance === 'dark' ? darkCanvasFill(context, size) : '#ffffff';
      }
      if (value === null || typeof value !== 'object') return null;
      if (typeof value.solid === 'string') return parseIconColor(value.solid);
      if (typeof value['automatic-gradient'] === 'string') return parseIconColor(value['automatic-gradient']);
      if (!Array.isArray(value['linear-gradient'])) return null;
      const stops = value['linear-gradient'].map(parseIconColor);
      if (stops.length < 2 || stops.some((stop) => stop === null)) return null;
      const orientation = value.orientation ?? {};
      const gradient = context.createLinearGradient(
        (orientation.start?.x ?? 0.5) * size,
        (orientation.start?.y ?? 0) * size,
        (orientation.stop?.x ?? 0.5) * size,
        (orientation.stop?.y ?? 1) * size,
      );
      stops.forEach((color, index) => gradient.addColorStop(index / (stops.length - 1), color));
      return gradient;
    }

    // A layer's hidden-specializations apply in order, the last matching entry winning.
    function layerHidden(layer, appearance) {
      if (layer?.hidden === true) return true;
      const specs = layer?.['hidden-specializations'];
      if (!Array.isArray(specs)) return false;
      let hidden = false;
      for (const spec of specs) {
        if (spec === null || typeof spec !== 'object') continue;
        if (spec.platform !== undefined) continue;
        if (spec.appearance !== undefined && spec.appearance !== appearance) continue;
        if (typeof spec.value === 'boolean') hidden = spec.value;
      }
      return hidden;
    }

    function loadImageElement(url) {
      return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('image decode failed'));
        image.src = url;
      });
    }

    // Composite one Icon Composer package: gradient or solid fill, then each visible
    // layer at its scale and translation on a 1024-point grid. Glass, shadow, and
    // specular effects are left out; at 14px they do not read.
    async function renderIconPackage(readFileBytes, sessionId, absolutePath, appearance) {
      const specRead = await readFileBytes(sessionId, `${absolutePath}/icon.json`, ICON_SPEC_BYTES);
      if (specRead?.ok !== true) return null;
      let spec;
      try {
        spec = JSON.parse(new TextDecoder().decode(specRead.value.data));
      } catch {
        return null;
      }
      if (spec === null || typeof spec !== 'object' || !Array.isArray(spec.groups)) return null;
      const canvas = document.createElement('canvas');
      canvas.width = ICON_CANVAS;
      canvas.height = ICON_CANVAS;
      const context = canvas.getContext('2d');
      if (context === null) return null;
      const background = canvasFillStyle(context, resolveCanvasFill(spec, appearance), ICON_CANVAS, appearance);
      if (background !== null) {
        context.fillStyle = background;
        context.fillRect(0, 0, ICON_CANVAS, ICON_CANVAS);
      }
      const ratio = ICON_CANVAS / 1024;
      // icon.json lists groups and their layers front to back, so the back-most
      // paint first; walking them in file order would bury the art under its fill.
      for (const group of [...spec.groups].reverse()) {
        if (group === null || typeof group !== 'object' || group.hidden === true) continue;
        for (const layer of [...(group.layers ?? [])].reverse()) {
          if (layerHidden(layer, appearance)) continue;
          const assetName = layer?.['image-name'];
          if (typeof assetName !== 'string' || assetName === '') continue;
          const asset = await readFileBytes(sessionId, `${absolutePath}/Assets/${assetName}`, MAX_ICON_BYTES);
          if (asset?.ok !== true) continue;
          const mime = iconMime(assetName) ?? 'application/octet-stream';
          const url = URL.createObjectURL(new Blob([asset.value.data], { type: mime }));
          try {
            const image = await loadImageElement(url);
            const scale = (typeof layer.position?.scale === 'number' ? layer.position.scale : 1) * ratio;
            const [translateX = 0, translateY = 0] = layer.position?.['translation-in-points'] ?? [];
            const width = image.naturalWidth * scale;
            const height = image.naturalHeight * scale;
            if (width > 0 && height > 0) {
              context.drawImage(
                image,
                ICON_CANVAS / 2 + translateX * ratio - width / 2,
                ICON_CANVAS / 2 + translateY * ratio - height / 2,
                width,
                height,
              );
            }
          } catch {
            /* a layer that will not decode is skipped */
          } finally {
            URL.revokeObjectURL(url);
          }
        }
      }
      return canvas.toDataURL('image/png');
    }

    // One read per file: rows and the picker's preview share the object URL, and a
    // failed read is remembered so a broken path does not retry on every render.
    function iconUrlFor(key, load) {
      if (ICON_URLS.has(key)) return Promise.resolve(ICON_URLS.get(key));
      const pending = ICON_LOADS.get(key);
      if (pending !== undefined) return pending;
      const promise = load().then(
        (url) => {
          ICON_URLS.set(key, url);
          ICON_LOADS.delete(key);
          return url;
        },
        () => {
          ICON_URLS.set(key, null);
          ICON_LOADS.delete(key);
          return null;
        },
      );
      ICON_LOADS.set(key, promise);
      return promise;
    }

    async function loadIconUrl(readFileBytes, sessionId, absolutePath) {
      if (absolutePath.endsWith('.icon')) {
        return renderIconPackage(readFileBytes, sessionId, absolutePath, currentAppearance());
      }
      const mime = iconMime(absolutePath);
      if (mime === null) return null;
      const result = await readFileBytes(sessionId, absolutePath, MAX_ICON_BYTES);
      if (result?.ok !== true || result.value.eof !== true) return null;
      return URL.createObjectURL(new Blob([result.value.data], { type: mime }));
    }

    function deriveRows(list, statuses, workspaces, currentId, archived, pinned, icons) {
      const byId = list.byId ?? {};
      const catalogs = list.projectionsBySession ?? {};
      // Direct subagent children come from the durable catalog and from live
      // child rows; a child can appear in both, so key by parent and child id.
      const childParents = new Map();
      const childLabels = new Map();
      for (const [parentId, projection] of Object.entries(catalogs)) {
        const catalog = projection?.values?.subagentCatalog;
        if (!Array.isArray(catalog)) continue;
        for (const child of catalog) {
          if (child.mode === 'external') continue;
          childParents.set(child.id, parentId);
          if (typeof child.label === 'string' && child.label !== '') childLabels.set(child.id, child.label);
        }
      }
      for (const child of Object.values(byId)) {
        if (child.origin !== 'subagent' || child.parentId === undefined) continue;
        childParents.set(child.id, child.parentId);
        if (childLabels.has(child.id)) continue;
        const label = child.title ?? child.displayTitle;
        if (typeof label === 'string' && label !== '') childLabels.set(child.id, label);
      }
      const childRuns = new Map();
      for (const [childId, parentId] of childParents) {
        if ((statuses?.get?.(childId)?.running ?? byId[childId]?.running) !== true) continue;
        let run = childRuns.get(parentId);
        if (run === undefined) childRuns.set(parentId, (run = { count: 0, labels: [] }));
        run.count += 1;
        const label = childLabels.get(childId);
        if (label !== undefined && run.labels.length < 3) run.labels.push(label);
      }
      const rows = [];
      for (const id of list.ids ?? []) {
        const session = byId[id];
        if (session === undefined) continue;
        if (session.origin === 'subagent') continue;
        if (session.blank === true && id !== currentId) continue;
        const status = statuses?.get?.(id);
        const childRun = childRuns.get(id);
        const subagentsRunning = childRun?.count ?? 0;
        // The control stream carries the live projection; the list block is the
        // cold-session cache fallback.
        const jobActivity = catalogs[id]?.values?.[JOB_ACTIVITY_KEY] ?? session.projectionValues?.[JOB_ACTIVITY_KEY];
        const jobsRunning = typeof jobActivity?.running === 'number' && jobActivity.running > 0 ? jobActivity.running : 0;
        const running = (status?.running ?? session.running) === true || subagentsRunning > 0;
        const kind = status?.pendingInteraction?.kind;
        const pending = kind === 'approval' || kind === 'plan-review' || kind === 'question' ? kind : undefined;
        const completed = status?.completionUnread === true;
        const updatedAtMs = toMillis(session.updatedAt);
        const workspace = workspaces.get(id);
        rows.push({
          id,
          title: session.blank === true ? '' : (session.title ?? '').trim(),
          blank: session.blank === true,
          workspace: workspace === undefined ? '' : (workspace.title || workspace.path || ''),
          workspaceId: workspace?.workspaceId,
          workspacePath: workspace?.path ?? '',
          icon: workspace === undefined ? null : projectIcon(workspaceIconName(workspace), icons[workspace.workspaceId]),
          updatedAtMs,
          archived: archived.has(id),
          pinned: pinned[id] !== undefined && !archived.has(id),
          pending,
          completed,
          running,
          jobsRunning,
          jobsLabels: Array.isArray(jobActivity?.labels) ? jobActivity.labels : [],
          subagentsRunning,
          subagentLabels: childRun?.labels ?? [],
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

    // Tree-view grouping. Rows arrive sorted (blank drafts, then pinned, then
    // newest input); grouping them by Workspace keeps each row's relative
    // order inside its group and orders groups by their first row's position.
    // The blank draft stays ungrouped on top; rows without a Workspace share
    // one bucket under the first of them.
    function buildGroups(rows) {
      const blanks = [];
      const groups = [];
      const seen = new Map();
      for (const row of rows) {
        if (row.blank) {
          blanks.push(row);
          continue;
        }
        const key = row.workspaceId ?? '';
        const group = seen.get(key);
        if (group === undefined) {
          const fresh = { key, workspaceId: row.workspaceId, workspace: row.workspace, icon: row.icon, first: row, rows: [] };
          seen.set(key, fresh);
          groups.push(fresh);
        }
        seen.get(key).rows.push(row);
      }
      return { blanks, groups };
    }

    function statusOf(row, unseen, t) {
      if (row.pending === 'approval') return { key: 'approval', tone: 'warn', label: t('status.approval') };
      if (row.pending === 'plan-review') return { key: 'planReview', tone: 'warn', label: t('status.planReview') };
      if (row.pending === 'question') return { key: 'answer', tone: 'warn', label: t('status.answer') };
      if (row.running) return { key: 'working', tone: 'working', label: t('status.working') };
      if (row.completed || unseen) return { key: 'done', tone: 'done', label: t('status.done') };
      return undefined;
    }

    // A floating panel closes on a click outside it, Escape, scroll or resize;
    // Escape also returns focus to the control that opened it. `inside` names the
    // panel and its trigger, so a click on either keeps the panel's own handler in
    // charge of toggling it.
    function useDismissFloating(open, setOpen, inside, openerRef) {
      React.useEffect(() => {
        if (!open) return undefined;
        const close = () => setOpen(null);
        const onPointerDown = (event) => {
          const target = event.target;
          if (target instanceof Element && target.closest(inside) !== null) return;
          close();
        };
        const onKeyDown = (event) => {
          if (event.key !== 'Escape') return;
          close();
          if (openerRef !== undefined) openerRef.current?.focus();
        };
        document.addEventListener('pointerdown', onPointerDown, true);
        document.addEventListener('keydown', onKeyDown);
        window.addEventListener('scroll', close, true);
        window.addEventListener('resize', close);
        return () => {
          document.removeEventListener('pointerdown', onPointerDown, true);
          document.removeEventListener('keydown', onKeyDown);
          window.removeEventListener('scroll', close, true);
          window.removeEventListener('resize', close);
        };
      }, [open, setOpen, inside, openerRef]);
    }

    function useIconUrl(key, load) {
      const [url, setUrl] = React.useState(() => (key === null ? null : (ICON_URLS.get(key) ?? null)));
      React.useEffect(() => {
        if (key === null) {
          setUrl(null);
          return undefined;
        }
        const cached = ICON_URLS.get(key);
        if (cached !== undefined) {
          setUrl(cached);
          return undefined;
        }
        let alive = true;
        setUrl(null);
        iconUrlFor(key, load).then((value) => {
          if (alive) setUrl(value);
        });
        return () => {
          alive = false;
        };
      }, [key]);
      return url;
    }

    // A tile's face: the chosen image when it loads, else the emoji or the
    // name-derived monogram. Both surfaces draw it — the sidebar row's tile and
    // the composer menu's leading glyph — so one Workspace looks the same twice.
    function ProjectFace(props) {
      const { icon, workspaceId, workspacePath, sessionId, readFileBytes } = props;
      const appearance = useAppearance();
      const absolutePath = icon.file === '' || readFileBytes === undefined ? null : `${workspacePath}/${icon.file}`;
      const key = absolutePath === null ? null : iconKey(workspaceId, icon.file, appearance);
      const url = useIconUrl(key, () => loadIconUrl(readFileBytes, sessionId, absolutePath));
      if (url !== null) {
        return h('img', { className: 'dsh-shelves-proj-img', src: url, alt: '', draggable: false });
      }
      if (icon.emoji !== '') return h('span', { className: 'dsh-shelves-proj-emoji' }, icon.emoji);
      return h(
        'svg',
        { viewBox: '0 0 16 16', 'aria-hidden': true },
        h(
          'text',
          {
            x: 8,
            y: 10.8,
            textAnchor: 'middle',
            fill: 'currentColor',
            fontSize: 8.25,
            fontWeight: 700,
            textLength: Array.from(icon.text).length === 1 ? 6 : 12,
            lengthAdjust: 'spacingAndGlyphs',
          },
          icon.text,
        ),
      );
    }

    // One row's Workspace tile: the face above, with the picker opening from it
    // and the project menu on the context-menu gesture.
    function ProjectTile(props) {
      const { icon, label, onOpen, onMenu } = props;
      return h(
        'button',
        {
          type: 'button',
          className: `dsh-shelves-proj dsh-shelves-pi-${icon.color}`,
          'aria-label': label,
          title: label,
          onClick: (event) => {
            event.stopPropagation();
            onOpen(event);
          },
          onContextMenu: (event) => {
            event.preventDefault();
            event.stopPropagation();
            onMenu(event);
          },
          onKeyDown: (event) => {
            if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
            event.preventDefault();
            event.stopPropagation();
            onMenu(event);
          },
        },
        h(ProjectFace, props),
      );
    }

    // The menu's leading glyph: the same face, non-interactive because the row
    // itself carries the activation.
    function MenuTile(props) {
      return h(
        'span',
        { className: `dsh-shelves-menuproj dsh-shelves-pi-${props.icon.color}`, 'aria-hidden': true },
        h(ProjectFace, props),
      );
    }

    // The conversation header's leading seat: the Session's Workspace tile, just
    // before its title. The seat is root-scoped, so the Session is the one the
    // main view retains — the same rule the sidebar highlights by.
    function HeaderTile(props) {
      const { useSessions, useWorkspaces, readFileBytes } = props;
      // Selecting the id, not the snapshot: the header is always mounted, so a
      // session tick must not re-render it unless the open Session changed.
      const currentId = useSessions((state) => {
        const byId = state?.byId ?? {};
        for (const id of Object.keys(byId)) {
          if ((byId[id]?.retainedBy?.mainView ?? 0) > 0) return id;
        }
        return undefined;
      });
      const workspaces = useWorkspaces((state) => state.items);
      const icons = React.useSyncExternalStore(iconsStore.subscribe, iconsStore.get);
      const workspace = React.useMemo(
        () => (currentId === undefined
          ? undefined
          : workspaces.find((item) => (item.sessionIds ?? []).includes(currentId))),
        [currentId, workspaces],
      );
      if (workspace === undefined) return null;
      const name = workspaceIconName(workspace);
      const icon = projectIcon(name, icons[workspace.workspaceId]);
      return h(
        'span',
        {
          className: `dsh-shelves-headtile dsh-shelves-pi-${icon.color}`,
          role: 'img',
          'aria-label': name,
          title: name,
        },
        h(ProjectFace, {
          icon,
          workspaceId: workspace.workspaceId,
          workspacePath: workspace.path ?? '',
          sessionId: currentId,
          readFileBytes,
        }),
      );
    }

    // Directory basenames the scan never enters: dependency stores and build
    // output, mirroring the host's own file-reference exclusions.
    const SCAN_SKIP = new Set([
      '.git', 'node_modules', 'dist', 'build', 'out', 'coverage', 'target',
      '.next', '.nuxt', '.turbo', '.venv', '__pycache__', '.pytest_cache',
      '.mypy_cache', '.gradle', 'vendor',
    ]);
    const SCAN_MAX_DIRS = 300;
    const SCAN_MAX_FILES = 500;
    const SCAN_BATCH = 8;

    // Breadth-first so shallow paths win the budget: the workspace root and its
    // public/ or assets/ folders are where an icon almost always lives.
    async function scanWorkspaceImages(listFiles, sessionId, workspacePath, signal) {
      const files = [];
      let frontier = [''];
      let visited = 0;
      let error = null;
      while (frontier.length > 0 && visited < SCAN_MAX_DIRS && files.length < SCAN_MAX_FILES) {
        if (signal.aborted) return { files, error };
        const batch = frontier.splice(0, SCAN_BATCH);
        visited += batch.length;
        const listings = await Promise.all(
          batch.map(async (dir) => {
            const target = dir === '' ? workspacePath : `${workspacePath}/${dir}`;
            try {
              return { dir, result: await listFiles(sessionId, target, signal) };
            } catch (failure) {
              return { dir, result: null, failure };
            }
          }),
        );
        for (const { dir, result, failure } of listings) {
          if (result?.ok !== true) {
            if (error === null) {
              error = result?.failure?.message ?? result?.failure?.code ?? (failure instanceof Error ? failure.message : null);
            }
            continue;
          }
          for (const entry of result.value?.entries ?? []) {
            const path = dir === '' ? entry.name : `${dir}/${entry.name}`;
            if (entry.type === 'directory') {
              if (entry.name.endsWith('.icon')) files.push({ path, package: true });
              else if (!SCAN_SKIP.has(entry.name)) frontier.push(path);
            } else if (entry.type === 'file' && iconMime(entry.name) !== null) {
              files.push({ path, size: entry.size });
            }
          }
        }
      }
      // Shallow images first: a root favicon or public/icon.png outranks a deep one.
      const depthOf = (path) => path.split('/').length;
      files.sort(
        (left, right) =>
          depthOf(left.path) - depthOf(right.path) ||
          left.path.localeCompare(right.path, undefined, { numeric: true, sensitivity: 'base' }),
      );
      return { files, error };
    }

    const ICON_HEADER_BYTES = 32 * 1024;
    // A tile is 14px, so a 2% difference never shows; exact equality would drop
    // icons exported a pixel off.
    const SQUARE_TOLERANCE = 0.02;
    const SQUARE_CACHE = new Map();

    const readU16BE = (bytes, at) => (bytes[at] << 8) | bytes[at + 1];
    const readU16LE = (bytes, at) => bytes[at] | (bytes[at + 1] << 8);
    const readU32BE = (bytes, at) => ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;
    const readU32LE = (bytes, at) => (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0;

    // Pixel size from the file header alone, so a whole workspace is filtered
    // without downloading every image. Each branch reads only the fields the
    // format puts near the start; null means the header did not say.
    function imageDimensions(bytes) {
      const length = bytes.length;
      if (length < 12) return null;
      // PNG: IHDR width and height, big endian.
      if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
        return length >= 24 ? { width: readU32BE(bytes, 16), height: readU32BE(bytes, 20) } : null;
      }
      // GIF: logical screen size, little endian.
      if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
        return length >= 10 ? { width: readU16LE(bytes, 6), height: readU16LE(bytes, 8) } : null;
      }
      // BMP: DIB header, height may be negative for top-down rows.
      if (bytes[0] === 0x42 && bytes[1] === 0x4d) {
        return length >= 26
          ? { width: Math.abs(readU32LE(bytes, 18) | 0), height: Math.abs(readU32LE(bytes, 22) | 0) }
          : null;
      }
      // WebP: VP8X canvas, VP8L lossless bitfield, or the VP8 lossy frame header.
      if (
        bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
        bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50 && length >= 30
      ) {
        const chunk = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
        if (chunk === 'VP8X') {
          return {
            width: 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)),
            height: 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)),
          };
        }
        if (chunk === 'VP8L') {
          const bits = readU32LE(bytes, 21);
          return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >>> 14) & 0x3fff) };
        }
        if (chunk === 'VP8 ') return { width: readU16LE(bytes, 26) & 0x3fff, height: readU16LE(bytes, 28) & 0x3fff };
        return null;
      }
      // JPEG: walk segments to the first start-of-frame.
      if (bytes[0] === 0xff && bytes[1] === 0xd8) {
        let at = 2;
        while (at + 9 < length) {
          if (bytes[at] !== 0xff) {
            at += 1;
            continue;
          }
          const marker = bytes[at + 1];
          if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
            at += 2;
            continue;
          }
          const size = readU16BE(bytes, at + 2);
          if (size < 2) return null;
          if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
            return { width: readU16BE(bytes, at + 7), height: readU16BE(bytes, at + 5) };
          }
          at += 2 + size;
        }
        return null;
      }
      // ICO: the first directory entry; zero means 256.
      if (bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0) {
        if (length < 8) return null;
        return { width: bytes[6] === 0 ? 256 : bytes[6], height: bytes[7] === 0 ? 256 : bytes[7] };
      }
      // SVG: viewBox first, then explicit width and height.
      const head = new TextDecoder().decode(bytes.subarray(0, Math.min(length, 4096))).trimStart();
      if (head.startsWith('<svg') || head.startsWith('<?xml')) {
        const viewBox = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(head);
        if (viewBox !== null) return { width: Number(viewBox[1]), height: Number(viewBox[2]) };
        const width = /\bwidth\s*=\s*["']([\d.]+)/i.exec(head);
        const height = /\bheight\s*=\s*["']([\d.]+)/i.exec(head);
        if (width !== null && height !== null) return { width: Number(width[1]), height: Number(height[1]) };
        return null;
      }
      // AVIF and HEIC: the first ispe box carries the display size.
      for (let at = 0; at + 16 < length; at += 1) {
        if (bytes[at] === 0x69 && bytes[at + 1] === 0x73 && bytes[at + 2] === 0x70 && bytes[at + 3] === 0x65) {
          return { width: readU32BE(bytes, at + 8), height: readU32BE(bytes, at + 12) };
        }
      }
      return null;
    }

    function isSquare(dimensions) {
      if (dimensions === null) return false;
      const { width, height } = dimensions;
      if (!(width > 0) || !(height > 0)) return false;
      return Math.abs(width - height) <= Math.max(1, Math.round(Math.max(width, height) * SQUARE_TOLERANCE));
    }

    // A package counts as square when its spec parses; its canvas is 1024 points.
    async function packageDimensions(readFileBytes, sessionId, absolutePath, signal) {
      try {
        const read = await readFileBytes(sessionId, `${absolutePath}/icon.json`, ICON_SPEC_BYTES, signal);
        if (read?.ok !== true) return null;
        const spec = JSON.parse(new TextDecoder().decode(read.value.data));
        return Array.isArray(spec?.groups) ? { width: 1024, height: 1024 } : null;
      } catch {
        return null;
      }
    }

    // Filter in bounded waves so a 500-image workspace keeps the dialog responsive;
    // results are remembered per path and byte size, so reopening is instant.
    async function squareImages(readFileBytes, sessionId, workspacePath, files, signal, onProgress) {
      const square = [];
      let cursor = 0;
      let done = 0;
      const worker = async () => {
        while (cursor < files.length && !signal.aborted) {
          const file = files[cursor];
          cursor += 1;
          const key = `${file.path}:${file.package === true ? 'package' : (file.size ?? 0)}`;
          let dimensions = SQUARE_CACHE.get(key);
          if (dimensions === undefined) {
            if (file.package === true) {
              dimensions = await packageDimensions(readFileBytes, sessionId, `${workspacePath}/${file.path}`, signal);
            } else {
              try {
                const read = await readFileBytes(sessionId, `${workspacePath}/${file.path}`, ICON_HEADER_BYTES, signal);
                dimensions = read?.ok === true ? imageDimensions(read.value.data) : null;
              } catch {
                dimensions = null;
              }
            }
            SQUARE_CACHE.set(key, dimensions);
          }
          if (isSquare(dimensions)) square.push({ ...file, width: dimensions.width, height: dimensions.height });
          done += 1;
          if (done % 8 === 0 || done === files.length) onProgress(done);
        }
      };
      await Promise.all(Array.from({ length: 8 }, worker));
      square.sort(
        (left, right) =>
          (left.path.split('/').length - right.path.split('/').length) ||
          left.path.localeCompare(right.path, undefined, { numeric: true, sensitivity: 'base' }),
      );
      return square;
    }

    // A thumbnail that reads its file only once the cell approaches the viewport,
    // so a large result set never downloads everything up front.
    function FileThumb(props) {
      const { workspaceId, workspacePath, sessionId, file, readFileBytes } = props;
      const appearance = useAppearance();
      const node = React.useRef(null);
      const [visible, setVisible] = React.useState(false);
      React.useEffect(() => {
        if (visible) return undefined;
        const element = node.current;
        if (element === null || typeof IntersectionObserver === 'undefined') {
          setVisible(true);
          return undefined;
        }
        const observer = new IntersectionObserver(
          (entries) => {
            if (entries.some((entry) => entry.isIntersecting)) {
              setVisible(true);
              observer.disconnect();
            }
          },
          { rootMargin: '160px' },
        );
        observer.observe(element);
        return () => observer.disconnect();
      }, [visible]);
      const key = visible ? iconKey(workspaceId, file.path, appearance) : null;
      const url = useIconUrl(key, () => loadIconUrl(readFileBytes, sessionId, `${workspacePath}/${file.path}`));
      return h(
        'span',
        { ref: node, className: 'dsh-shelves-files-thumb' },
        url === null ? null : h('img', { src: url, alt: '', draggable: false }),
      );
    }

    // Two icons named icon.svg in different folders need their folder to tell them apart.
    function labelOf(file, basenames) {
      const base = file.path.slice(file.path.lastIndexOf('/') + 1);
      if ((basenames.get(base) ?? 0) < 2) return base;
      const parts = file.path.split('/');
      return parts.length > 1 ? `${parts[parts.length - 2]}/${base}` : base;
    }

    // Square images only, previewed as a grid: the shape an icon tile needs, with
    // the size filter done from headers so the whole workspace stays cheap.
    function FileDialog(props) {
      const { workspaceId, workspacePath, sessionId, name, current, listFiles, readFileBytes, t, onClose, onPick } = props;
      const [phase, setPhase] = React.useState({ status: 'scanning', done: 0, total: 0, error: null });
      const [files, setFiles] = React.useState([]);
      const [query, setQuery] = React.useState('');
      const [selected, setSelected] = React.useState(null);
      const preselected = React.useRef(false);

      // Opening the picker starts on the icon this Workspace already uses.
      React.useEffect(() => {
        if (preselected.current || current === '' || files.length === 0) return;
        const match = files.find((file) => file.path === current);
        if (match === undefined) return;
        preselected.current = true;
        setSelected(match);
      }, [files, current]);

      React.useEffect(() => {
        if (selected === null) return;
        document.querySelector('.dsh-shelves-files-cell[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
      }, [selected]);

      React.useEffect(() => {
        const controller = new AbortController();
        setPhase({ status: 'scanning', done: 0, total: 0, error: null });
        setFiles([]);
        (async () => {
          const scan = await scanWorkspaceImages(listFiles, sessionId, workspacePath, controller.signal);
          if (controller.signal.aborted) return;
          setPhase({ status: 'checking', done: 0, total: scan.files.length, error: scan.error });
          const square = await squareImages(
            readFileBytes,
            sessionId,
            workspacePath,
            scan.files,
            controller.signal,
            (done) => {
              if (!controller.signal.aborted) setPhase({ status: 'checking', done, total: scan.files.length, error: null });
            },
          );
          if (controller.signal.aborted) return;
          setFiles(square);
          setPhase({
            status: 'ready',
            done: square.length,
            total: scan.files.length,
            error: square.length === 0 ? scan.error : null,
          });
        })().catch((error) => {
          if (controller.signal.aborted) return;
          setPhase({
            status: 'failed',
            done: 0,
            total: 0,
            error: error instanceof Error ? error.message : String(error),
          });
        });
        return () => controller.abort();
      }, [sessionId, workspacePath, listFiles, readFileBytes]);

      React.useEffect(() => {
        const onKeyDown = (event) => {
          if (event.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
      }, [onClose]);

      const needle = query.trim().toLowerCase();
      const visible = needle === '' ? files : files.filter((file) => file.path.toLowerCase().includes(needle));
      const basenames = new Map();
      for (const file of visible) {
        const base = file.path.slice(file.path.lastIndexOf('/') + 1);
        basenames.set(base, (basenames.get(base) ?? 0) + 1);
      }

      let status;
      if (phase.status === 'scanning') status = t('file.scanning');
      else if (phase.status === 'checking') status = t('file.checking', { done: phase.done, total: phase.total });
      else if (phase.status === 'failed') status = phase.error ?? t('file.empty');
      else status = t('file.count', { n: files.length });

      let content;
      if (phase.status === 'scanning' || phase.status === 'checking') {
        content = h('div', { className: 'dsh-shelves-files-empty' }, status);
      } else if (visible.length === 0) {
        const empty = phase.status === 'failed' ? status : files.length > 0 ? t('file.noMatch') : (phase.error ?? t('file.empty'));
        content = h('div', { className: 'dsh-shelves-files-empty' }, empty);
      } else {
        content = h(
          'div',
          { className: 'dsh-shelves-files-grid' },
          visible.map((file) =>
            h(
              'button',
              {
                key: file.path,
                type: 'button',
                className: 'dsh-shelves-files-cell',
                'aria-selected': selected?.path === file.path ? 'true' : undefined,
                title: `${file.path} · ${file.width}×${file.height}`,
                onClick: () => setSelected(file),
              },
              h(FileThumb, { workspaceId, workspacePath, sessionId, file, readFileBytes }),
              h('span', { className: 'dsh-shelves-files-cell-name' }, labelOf(file, basenames)),
            ),
          ),
        );
      }

      const selectedLabel =
        selected === null
          ? t('file.hint')
          : `${selected.path} · ${selected.width}×${selected.height}`;

      return h(
        'div',
        {
          className: 'dsh-shelves-files',
          onPointerDown: (event) => {
            if (event.target === event.currentTarget) onClose();
          },
        },
        h(
          'div',
          { className: 'dsh-shelves-files-panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('file.title') },
          h(
            'div',
            { className: 'dsh-shelves-files-head' },
            h('span', { className: 'dsh-shelves-files-title' }, t('file.title')),
            h('span', { className: 'dsh-shelves-files-name' }, name),
          ),
          h(
            'div',
            { className: 'dsh-shelves-files-toolbar' },
            h(
              'span',
              { className: 'dsh-shelves-files-search' },
              h('span', { className: 'dsh-shelves-files-glyph' }, glyph('search', 13)),
              h('input', {
                autoFocus: true,
                type: 'text',
                value: query,
                placeholder: t('file.search'),
                'aria-label': t('file.search'),
                onChange: (event) => setQuery(event.target.value),
              }),
            ),
            h('span', { className: 'dsh-shelves-files-status' }, status),
          ),
          h('div', { className: 'dsh-shelves-files-rows' }, content),
          h(
            'div',
            { className: 'dsh-shelves-files-foot' },
            h('span', { className: 'dsh-shelves-files-selected', title: selected === null ? undefined : selected.path }, selectedLabel),
            h('button', { type: 'button', className: 'dsh-shelves-files-btn', onClick: onClose }, t('file.cancel')),
            h(
              'button',
              {
                type: 'button',
                className: 'dsh-shelves-files-btn dsh-shelves-files-btn-primary',
                disabled: selected === null,
                onClick: () => {
                  if (selected !== null) onPick(selected.path);
                },
              },
              t('file.pick'),
            ),
          ),
        ),
      );
    }

    function Shelves(props) {
      const { wide, expandSidebar, useSessions, useSessionStatus, useWorkspaces, usePanelInfo, useWorkspaceAccess, openSession, archiveSession, unarchiveSession, forkSession, renameSession, deleteWorkspace, getOpenTabs, listFiles, readFileBytes, t } = props;
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
      const [pinned, setPinned] = React.useState(() => normalizeMap(readJson(PINNED_KEY, {})));
      const icons = React.useSyncExternalStore(iconsStore.subscribe, iconsStore.get);
      // The settings panel floats over the column, so it keeps only its fixed
      // box; the gear is the control it is anchored to and returns focus to.
      const [settingsPopover, setSettingsPopover] = React.useState(null);
      const settingsGearRef = React.useRef(null);
      const [archivedOpen, setArchivedOpen] = React.useState(false);
      // Collapsed workspace groups in the tree view; persisted so the folds
      // survive reloads. The value is a map of workspace id -> 1.
      const [collapsed, setCollapsed] = React.useState(() => normalizeMap(readJson(COLLAPSED_KEY, {})));
      const [iconPicker, setIconPicker] = React.useState(null);
      const [filePicker, setFilePicker] = React.useState(null);
      // One card menu at a time, anchored at the gesture point. `row` is the
      // occurrence snapshot; the element restores focus after a keyboard open.
      // A project menu rides the same slot with `kind: 'project'`.
      const [cardMenu, setCardMenu] = React.useState(null);
      const cardMenuRef = React.useRef(null);
      cardMenuRef.current = cardMenu;
      // A rename request owns its draft so a rejected write keeps the dialog.
      const [rename, setRename] = React.useState(null);
      // Removal keeps its target and failure text so a rejected write stays visible.
      const [removeProject, setRemoveProject] = React.useState(null);
      const [toast, setToast] = React.useState(null);
      const [clock, bumpClock] = React.useReducer((n) => n + 1, 0);
      // The pointer point is a zero-size rect; the Menu primitive clamps it to
      // the viewport and follows scroll and resize while open.
      const cardMenuRect = React.useCallback(() => {
        const menu = cardMenuRef.current;
        if (menu === null) return null;
        return { left: menu.x, right: menu.x, top: menu.y, bottom: menu.y, width: 0, height: 0 };
      }, []);

      React.useEffect(() => {
        const id = window.setInterval(bumpClock, 60000);
        return () => window.clearInterval(id);
      }, []);

      // The rail renders no cards, so a pending menu or panel must not survive a
      // collapse.
      React.useEffect(() => {
        if (!wide) {
          setCardMenu(null);
          setSettingsPopover(null);
        }
      }, [wide]);

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

      // A null patch drops the Workspace back to its automatic identity.
      const updateIcon = (workspaceId, patch) => {
        const next = { ...iconsStore.get() };
        if (patch === null) delete next[workspaceId];
        else next[workspaceId] = { ...next[workspaceId], ...patch };
        iconsStore.set(next);
      };

      const openIconPicker = (row, element) => {
        const rect = element.getBoundingClientRect();
        const left = Math.max(8, Math.min(rect.left, window.innerWidth - 208));
        const height = 200;
        const top = rect.bottom + 6 + height > window.innerHeight ? Math.max(8, rect.top - height - 6) : rect.bottom + 6;
        setIconPicker({
          workspaceId: row.workspaceId,
          workspacePath: row.workspacePath,
          sessionId: row.id,
          name: row.workspace,
          left,
          top,
        });
      };

      const openFilePicker = () => {
        const current = icons[iconPicker.workspaceId]?.file;
        setFilePicker({
          workspaceId: iconPicker.workspaceId,
          workspacePath: iconPicker.workspacePath,
          sessionId: iconPicker.sessionId,
          name: iconPicker.name,
          current: typeof current === 'string' ? current : '',
        });
        setIconPicker(null);
      };

      // The shelf sits at the bottom of the column, so the panel grows upward from
      // the gear: anchoring its bottom edge needs no height estimate.
      const openSettings = (element) => {
        const rect = element.getBoundingClientRect();
        const left = Math.max(
          8,
          Math.min(rect.right - SETTINGS_POPOVER_WIDTH, window.innerWidth - SETTINGS_POPOVER_WIDTH - 8),
        );
        setSettingsPopover({ left, bottom: Math.max(8, window.innerHeight - rect.top + 6) });
      };

      useDismissFloating(iconPicker !== null, setIconPicker, '.dsh-shelves-iconpicker, .dsh-shelves-proj');
      useDismissFloating(
        settingsPopover !== null,
        setSettingsPopover,
        '.dsh-shelves-settings, .dsh-shelves-gear',
        settingsGearRef,
      );
      // The expanded Archived shelf folds back on a click anywhere outside it, so
      // browsing the column never leaves it open. Its own header row and list keep
      // it open, and the header button still toggles it.
      React.useEffect(() => {
        if (!archivedOpen) return undefined;
        const onPointerDown = (event) => {
          const target = event.target;
          if (target instanceof Element && target.closest('.dsh-shelves-headrow, .dsh-shelves-archived-list') !== null) {
            return;
          }
          setArchivedOpen(false);
        };
        document.addEventListener('pointerdown', onPointerDown, true);
        return () => document.removeEventListener('pointerdown', onPointerDown, true);
      }, [archivedOpen]);

      const currentId = React.useMemo(() => {
        const byId = list.byId ?? {};
        for (const id of Object.keys(byId)) {
          if ((byId[id]?.retainedBy?.mainView ?? 0) > 0) return id;
        }
        return undefined;
      }, [list]);

      const archived = React.useMemo(() => new Set(archivedIds ?? []), [archivedIds]);
      const rows = React.useMemo(
        () => deriveRows(list, statuses, workspaceIndex(items), currentId, archived, pinned, icons),
        [list, statuses, items, currentId, archived, pinned, icons],
      );
      // The gear leaves with the last card, so its panel must not outlive it.
      React.useEffect(() => {
        if (rows.length === 0) setSettingsPopover(null);
      }, [rows.length]);
      // Archiving drops the pin with the session, so unarchiving never brings
      // back a pin that could not be seen or cleared while it was archived.
      React.useEffect(() => {
        setPinned((prev) => {
          const next = {};
          let dropped = false;
          for (const [id, at] of Object.entries(prev)) {
            if (archived.has(id)) dropped = true;
            else next[id] = at;
          }
          if (!dropped) return prev;
          writeJson(PINNED_KEY, next);
          return next;
        });
      }, [archived]);
      // Owner-only; a shared page never receives a project removal row.
      const canRemoveProject = useWorkspaceAccess(cardMenu?.row.workspaceId ?? '', 'workspace/delete');

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
          if (row.running || row.jobsRunning > 0 || row.pending !== undefined || row.completed) continue;
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
      const attention = active.filter((row) => statusOf(row, unseen.has(row.id), t) !== undefined || row.jobsRunning > 0).length;

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
      //
      // Archiving the card on screen clears the main view and shows the New
      // Session page, so that one opens the card below instead — or the one
      // above when it was last — once the archive is durable. A failure keeps
      // the current card, so a refused archive never moves the user.
      const nextAfterArchive = (row) => {
        if (row.id !== currentId) return undefined;
        const index = active.findIndex((candidate) => candidate.id === row.id);
        if (index === -1) return undefined;
        return active[index + 1] ?? active[index - 1];
      };

      const toggleArchive = (row) => {
        if (row.archived) {
          Promise.resolve(unarchiveSession(row.id)).catch(() => {});
          return;
        }
        const next = nextAfterArchive(row);
        Promise.resolve(archiveSession(row.id))
          .then(() => {
            if (next !== undefined) open(next);
          })
          .catch(() => {});
      };

      const togglePin = (row) => {
        const next = { ...pinned };
        if (next[row.id] === undefined) next[row.id] = Date.now();
        else delete next[row.id];
        updatePinned(next);
      };

      const toggleGroup = (key) =>
        setCollapsed((prev) => {
          const next = { ...prev };
          if (next[key] === undefined) next[key] = 1;
          else delete next[key];
          writeJson(COLLAPSED_KEY, next);
          return next;
        });

      const showToast = (text, tone) => setToast({ text, tone, key: Date.now() });

      // The card menu mirrors the native Session menu: same verbs, same order.
      // It never opens the Session, so a background row keeps the selection.
      const openCardMenu = (row, point, keyboard, element) => {
        if (row.blank) return;
        setCardMenu({ kind: 'session', row, x: point.x, y: point.y, keyboard, element });
      };

      // A project menu hangs off a Workspace tile or name: change its tile or
      // remove its registration. Sessions and files stay untouched.
      const openProjectMenu = (row, point, keyboard, element) => {
        if (row.workspaceId === undefined) return;
        setIconPicker(null);
        setCardMenu({ kind: 'project', row, x: point.x, y: point.y, keyboard, element });
      };

      const closeCardMenu = () => {
        const menu = cardMenuRef.current;
        setCardMenu(null);
        // A keyboard menu owns focus while open; hand it back to its row.
        if (menu?.keyboard) {
          Promise.resolve().then(() => {
            if (menu.element?.isConnected) menu.element.focus();
          });
        }
      };

      const cardMenuItems = (row) => {
        const items = [];
        if (!row.archived) {
          items.push({ id: 'pin', label: row.pinned ? t('action.unpin') : t('action.pin'), icon: glyph('pin', 16) });
        }
        items.push({ id: 'rename', label: t('action.rename'), icon: glyph('rename', 16) });
        items.push({ id: 'fork', label: t('action.fork'), icon: glyph('fork', 16) });
        items.push({ type: 'separator', id: 'card-menu-copy' });
        items.push({ id: 'copyId', label: t('action.copyId'), icon: glyph('copy', 16) });
        items.push({ type: 'separator', id: 'card-menu-archive' });
        items.push({
          id: 'archive',
          label: row.archived ? t('action.unarchive') : t('action.archive'),
          icon: glyph(row.archived ? 'unarchive' : 'archive', 16),
        });
        if (row.workspaceId !== undefined && canRemoveProject) {
          items.push({ type: 'separator', id: 'card-menu-project' });
          items.push({ id: 'removeProject', label: t('action.removeProject'), icon: glyph('trash', 16), danger: true });
        }
        return items;
      };

      const projectMenuItems = () => {
        const items = [{ id: 'projectIcon', label: t('icon.edit'), icon: glyph('image', 16) }];
        if (canRemoveProject) {
          items.push({ type: 'separator', id: 'project-menu-remove' });
          items.push({ id: 'removeProject', label: t('action.removeProject'), icon: glyph('trash', 16), danger: true });
        }
        return items;
      };

      const selectCardMenuItem = (id) => {
        const menu = cardMenuRef.current;
        if (menu === null) return;
        closeCardMenu();
        // Read the live row: pin and archive state may have moved since opening.
        const row = rows.find((candidate) => candidate.id === menu.row.id) ?? menu.row;
        if (menu.kind === 'project') {
          if (id === 'projectIcon') {
            if (menu.element?.isConnected) openIconPicker(row, menu.element);
          } else if (id === 'removeProject' && row.workspaceId !== undefined) {
            setRemoveProject({ workspaceId: row.workspaceId, name: row.workspace, busy: false, error: null });
          }
          return;
        }
        if (id === 'pin') togglePin(row);
        else if (id === 'rename') setRename({ id: row.id, draft: row.title || '', busy: false, error: null });
        else if (id === 'fork') {
          Promise.resolve()
            .then(() => forkSession(row.id))
            .catch((reason) => {
              console.warn('sidebar-shelves: fork failed', reason);
              showToast(t('action.forkFailed'), 'error');
            });
        } else if (id === 'copyId') {
          Promise.resolve()
            .then(() => writeClipboard(row.id))
            .then((ok) => showToast(ok ? t('action.copyIdDone') : t('action.copyIdFailed'), ok ? 'success' : 'error'))
            .catch(() => showToast(t('action.copyIdFailed'), 'error'));
        } else if (id === 'archive') toggleArchive(row);
        else if (id === 'removeProject' && row.workspaceId !== undefined) {
          setRemoveProject({ workspaceId: row.workspaceId, name: row.workspace, busy: false, error: null });
        }
      };

      const submitRename = () => {
        const target = rename;
        if (target === null || target.busy) return;
        const title = target.draft.trim();
        if (title === '') {
          setRename({ ...target, error: t('rename.empty') });
          return;
        }
        setRename({ ...target, busy: true, error: null });
        Promise.resolve()
          .then(() => renameSession(target.id, title))
          .then(() => setRename(null))
          .catch((reason) => {
            const message = reason instanceof Error ? reason.message : String(reason);
            setRename((current) =>
              current !== null && current.id === target.id ? { ...current, busy: false, error: message } : current,
            );
          });
      };

      // Removing a project only deletes the Workspace registration; the folder
      // and every Session stay. A successful delete also drops the local tile choice.
      const confirmRemoveProject = () => {
        const target = removeProject;
        if (target === null || target.busy) return;
        setRemoveProject({ ...target, busy: true, error: null });
        Promise.resolve()
          .then(() => deleteWorkspace(target.workspaceId))
          .then(() => {
            updateIcon(target.workspaceId, null);
            setRemoveProject(null);
            showToast(t('remove.done'), 'success');
          })
          .catch((reason) => {
            const message = reason instanceof Error ? reason.message : String(reason);
            setRemoveProject((current) =>
              current !== null && current.workspaceId === target.workspaceId
                ? { ...current, busy: false, error: message }
                : current,
            );
          });
      };

      // The Workspace's tile: its chosen image, an emoji, or a two-letter monogram
      // in its own color. Clicking it opens the picker; an ungrouped Session has none.
      const renderProjectIcon = (row) => {
        if (row.icon === null) return null;
        return h(ProjectTile, {
          key: `${row.workspaceId}:${row.icon.file}`,
          icon: row.icon,
          label: `${t('icon.edit')}: ${row.workspace}`,
          workspaceId: row.workspaceId,
          workspacePath: row.workspacePath,
          sessionId: row.id,
          readFileBytes,
          onOpen: (event) => openIconPicker(row, event.currentTarget),
          onMenu: (event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const keyboard = event.type !== 'contextmenu';
            openProjectMenu(
              row,
              keyboard ? { x: rect.left + 10, y: rect.bottom - 6 } : { x: event.clientX, y: event.clientY },
              keyboard,
              event.currentTarget,
            );
          },
        });
      };

      // A count badge is additive to the exclusive status icon: a session can be
      // waiting for approval and still own two background jobs.
      const renderActivityBadge = (kind, count, labels) => {
        if (count <= 0) return null;
        const plural = count === 1 ? '.one' : '.other';
        const base = t(`activity.${kind}${plural}`, { n: count });
        const shown = labels
          .map((label) => (typeof label === 'string' ? label.replace(/\s+/g, ' ').trim().slice(0, 60) : ''))
          .filter((label) => label !== '')
          .slice(0, 3);
        const title = shown.length === 0 ? base : base + t('activity.detail', { items: shown.join(t('activity.comma')) });
        return h(
          'span',
          {
            key: `activity-${kind}`,
            className: `dsh-shelves-badge dsh-shelves-badge-${kind}`,
            role: 'img',
            'aria-label': title,
            title,
          },
          glyph(kind === 'jobs' ? 'jobs' : 'robot', 12),
          h('span', { className: 'dsh-shelves-badge-n' }, count > 99 ? '99+' : String(count)),
        );
      };

      const renderRow = (row) => {
        const selected = row.id === currentId && !panelActive;
        const title = row.blank ? t('session.new') : row.title || t('session.untitled');
        const status = row.archived ? undefined : statusOf(row, unseen.has(row.id), t);
        const time = relativeTime(row.updatedAtMs, Date.now(), t);
        const timeClass = status?.tone === 'working' ? 'dsh-shelves-time dsh-shelves-time-running' : 'dsh-shelves-time';
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
            onContextMenu: (event) => {
              event.preventDefault();
              event.stopPropagation();
              openCardMenu(row, { x: event.clientX, y: event.clientY }, false, event.currentTarget);
            },
            onKeyDown: (event) => {
              // Keys pressed inside the row's own buttons belong to those buttons.
              if (event.target !== event.currentTarget) return;
              // The platform context-menu gesture opens the same menu as the pointer.
              if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
                event.preventDefault();
                const rect = event.currentTarget.getBoundingClientRect();
                openCardMenu(row, { x: rect.left + 10, y: rect.bottom - 6 }, true, event.currentTarget);
                return;
              }
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
            h('span', { className: status?.key === 'done' ? 'dsh-shelves-title dsh-shelves-title-done' : 'dsh-shelves-title' }, title),
            time === '' ? null : h('span', { className: timeClass }, time),
          ),
          h(
            'span',
            { className: 'dsh-shelves-metaline' },
            renderProjectIcon(row),
            row.pinned
              ? h(
                  'span',
                  { className: 'dsh-shelves-pin', role: 'img', 'aria-label': t('action.pin'), title: t('action.pin') },
                  glyph('pin', 12),
                )
              : null,
            h(
              'span',
              {
                className: 'dsh-shelves-ws',
                title: row.workspace || undefined,
                onContextMenu:
                  row.workspaceId === undefined
                    ? undefined
                    : (event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        openProjectMenu(row, { x: event.clientX, y: event.clientY }, false, event.currentTarget);
                      },
              },
              row.workspace,
            ),
            renderActivityBadge('jobs', row.jobsRunning, row.jobsLabels),
            renderActivityBadge('subagents', row.subagentsRunning, row.subagentLabels),
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
            row.archived
              ? null
              : h(
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

      // One Workspace group's header in the tree view: the shelf-header shape
      // with the project tile replacing the label and the project menu riding
      // the context-menu gesture, mirroring the row's workspace-name behavior.
      const renderGroupHeader = (group) => {
        const open = collapsed[group.key] === undefined;
        const first = group.first;
        return h(
          'div',
          { key: `group-${group.key}`, className: 'dsh-shelves-headrow' },
          h(
            'button',
            {
              type: 'button',
              className: 'dsh-shelves-head',
              'aria-expanded': open ? 'true' : 'false',
              title: group.workspace === '' ? t('group.unspecified') : group.workspace,
              onClick: () => toggleGroup(group.key),
              onContextMenu: (event) => {
                if (group.workspaceId === undefined) return;
                event.preventDefault();
                event.stopPropagation();
                openProjectMenu(first, { x: event.clientX, y: event.clientY }, false, event.currentTarget);
              },
              onKeyDown: (event) => {
                if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
                if (group.workspaceId === undefined) return;
                event.preventDefault();
                const rect = event.currentTarget.getBoundingClientRect();
                openProjectMenu(first, { x: rect.left + 10, y: rect.bottom - 6 }, true, event.currentTarget);
              },
            },
            h(
              'span',
              { className: open ? 'dsh-shelves-chevron dsh-shelves-chevron-open' : 'dsh-shelves-chevron' },
              glyph('chevron', 14),
            ),
            group.workspaceId === undefined
              ? null
              : h(
                  'span',
                  { className: `dsh-shelves-headtile dsh-shelves-pi-${first.icon.color}` },
                  h(ProjectFace, {
                    icon: first.icon,
                    workspaceId: first.workspaceId,
                    workspacePath: first.workspacePath,
                    sessionId: first.id,
                    readFileBytes,
                  }),
                ),
            h(
              'span',
              { className: 'dsh-shelves-group-title' },
              group.workspace === '' ? t('group.unspecified') : group.workspace,
            ),
            h('span', { className: 'dsh-shelves-count' }, String(group.rows.length)),
          ),
        );
      };

      const stack = [];
      if (rows.length === 0) {
        stack.push(h('div', { key: 'empty', className: 'dsh-shelves-empty' }, t('shelf.empty')));
      } else {
        if (settings.view === 'tree') {
          const { blanks, groups } = buildGroups(active);
          for (const row of blanks) stack.push(renderRow(row));
          for (const group of groups) {
            stack.push(renderGroupHeader(group));
            if (collapsed[group.key] === undefined) {
              stack.push(
                h(
                  'div',
                  { key: `group-body-${group.key}`, className: 'dsh-shelves-group-body' },
                  group.rows.map((row) => renderRow(row)),
                ),
              );
            }
          }
        } else {
          for (const row of active) stack.push(renderRow(row));
        }

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
                ref: settingsGearRef,
                className: 'dsh-shelves-gear',
                'aria-label': t('settings.label'),
                'aria-expanded': settingsPopover !== null ? 'true' : 'false',
                'aria-haspopup': 'dialog',
                title: t('settings.label'),
                onClick: (event) =>
                  settingsPopover === null ? openSettings(event.currentTarget) : setSettingsPopover(null),
              },
              glyph('gear', 14),
            ),
          ),
        );
        if (archivedOpen) {
          bottom.push(
            h(
              'div',
              { key: 'archived-list', className: 'dsh-shelves-archived-list' },
              archivedRows.map((row) => renderRow(row)),
            ),
          );
        }

        stack.push(h('div', { key: 'bottom', className: 'dsh-shelves-bottom' }, bottom));
      }

      // Anchored under the clicked tile; fixed so the scroll column cannot clip it.
      const renderIconPicker = () => {
        if (iconPicker === null) return null;
        const workspaceId = iconPicker.workspaceId;
        const current = projectIcon(iconPicker.name, icons[workspaceId]);
        return h(
          'div',
          {
            className: 'dsh-shelves-iconpicker',
            style: { left: iconPicker.left, top: iconPicker.top },
            role: 'dialog',
            'aria-label': t('icon.edit'),
          },
          h(
            'div',
            { className: 'dsh-shelves-iconpicker-head' },
            h('span', { className: 'dsh-shelves-iconpicker-name' }, iconPicker.name),
            h(
              'button',
              { type: 'button', className: 'dsh-shelves-iconpicker-auto', onClick: () => updateIcon(workspaceId, null) },
              t('icon.auto'),
            ),
          ),
          h(
            'div',
            { className: 'dsh-shelves-swatches' },
            PROJECT_COLORS.map(([color], index) => {
              const active = current.color === color;
              return h('button', {
                key: color,
                autoFocus: index === 0,
                type: 'button',
                className: active
                  ? `dsh-shelves-swatch dsh-shelves-pi-${color} dsh-shelves-swatch-on`
                  : `dsh-shelves-swatch dsh-shelves-pi-${color}`,
                'aria-label': color,
                'aria-pressed': active ? 'true' : 'false',
                title: color,
                onClick: () => updateIcon(workspaceId, { color }),
              });
            }),
          ),
          h(
            'div',
            { className: 'dsh-shelves-emojis' },
            PROJECT_EMOJIS.map((emoji) => {
              const active = current.emoji === emoji;
              return h(
                'button',
                {
                  key: emoji,
                  type: 'button',
                  'aria-label': emoji,
                  'aria-pressed': active ? 'true' : 'false',
                  onClick: () => updateIcon(workspaceId, { emoji: active ? '' : emoji, file: '' }),
                },
                emoji,
              );
            }),
          ),
          h(
            'button',
            { type: 'button', className: 'dsh-shelves-iconpicker-file', onClick: openFilePicker },
            h('span', { className: 'dsh-shelves-files-glyph' }, glyph('image', 13)),
            h('span', null, t('icon.file')),
          ),
        );
      };

      // Anchored above the gear, so opening it never reflows the column.
      const renderSettingsPopover = () => {
        if (settingsPopover === null) return null;
        return h(
          'div',
          {
            className: 'dsh-shelves-settings',
            style: { left: settingsPopover.left, bottom: settingsPopover.bottom, width: SETTINGS_POPOVER_WIDTH },
            role: 'dialog',
            'aria-label': t('settings.label'),
          },
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
                  autoFocus: true,
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
          h(
            'div',
            { className: 'dsh-shelves-setting' },
            h('span', null, t('settings.view')),
            h(
              'span',
              { className: 'dsh-shelves-select' },
              h(
                'select',
                {
                  'aria-label': t('settings.view'),
                  value: settings.view,
                  onChange: (event) => updateSettings({ view: event.target.value === 'flat' ? 'flat' : 'tree' }),
                },
                h('option', { value: 'tree' }, t('settings.view.tree')),
                h('option', { value: 'flat' }, t('settings.view.flat')),
              ),
              h('span', { className: 'dsh-shelves-select-chevron' }, glyph('chevron', 12)),
            ),
          ),
        );
      };

      return h(
        React.Fragment,
        null,
        styles,
        h(
          'div',
          { key: 'root', className: 'dsh-shelves-root' },
          h('div', { className: 'dsh-shelves-scroll' }, h('div', { className: 'dsh-shelves-stack' }, stack)),
          renderIconPicker(),
          renderSettingsPopover(),
          filePicker === null
            ? null
            : h(FileDialog, {
                ...filePicker,
                listFiles,
                readFileBytes,
                t,
                onClose: () => setFilePicker(null),
                onPick: (file) => {
                  updateIcon(filePicker.workspaceId, { file, emoji: '' });
                  setFilePicker(null);
                },
              }),
          h(Menu, {
            open: cardMenu !== null,
            anchor: null,
            items:
              cardMenu === null
                ? []
                : cardMenu.kind === 'project'
                  ? projectMenuItems()
                  : cardMenuItems(cardMenu.row),
            onSelect: selectCardMenuItem,
            onClose: closeCardMenu,
            side: 'bottom',
            portal: true,
            autoFocus: cardMenu?.keyboard === true,
            getAnchorRect: cardMenuRect,
          }),
          toast === null
            ? null
            : h(Toast, {
                key: toast.key,
                text: toast.text,
                tone: toast.tone,
                onDone: () => setToast(null),
              }),
          h(
            Modal,
            {
              open: rename !== null,
              onClose: () => {
                if (rename === null || rename.busy) return;
                setRename(null);
              },
              closeLabel: t('rename.cancel'),
              title: t('rename.title'),
              footer: [
                h(Button, { key: 'cancel', onClick: () => (rename?.busy ? undefined : setRename(null)) }, t('rename.cancel')),
                h(
                  Button,
                  { key: 'confirm', variant: 'primary', disabled: rename?.busy === true, onClick: submitRename },
                  t('rename.confirm'),
                ),
              ],
            },
            h(
              'div',
              { className: 'dsh-shelves-rename' },
              h('input', {
                type: 'text',
                value: rename?.draft ?? '',
                placeholder: t('session.untitled'),
                autoFocus: true,
                'aria-label': t('rename.title'),
                onChange: (event) => {
                  const value = event.target.value;
                  setRename((current) => (current === null ? current : { ...current, draft: value, error: null }));
                },
                onKeyDown: (event) => {
                  if (event.key !== 'Enter') return;
                  event.preventDefault();
                  submitRename();
                },
              }),
              rename?.error ? h('div', { className: 'dsh-shelves-rename-error', role: 'alert' }, rename.error) : null,
            ),
          ),
          h(
            Modal,
            {
              open: removeProject !== null,
              onClose: () => {
                if (removeProject === null || removeProject.busy) return;
                setRemoveProject(null);
              },
              closeLabel: t('remove.cancel'),
              title: t('remove.title'),
              footer: [
                h(
                  Button,
                  { key: 'cancel', onClick: () => (removeProject?.busy ? undefined : setRemoveProject(null)) },
                  t('remove.cancel'),
                ),
                h(
                  Button,
                  {
                    key: 'confirm',
                    variant: 'outline',
                    className: 'dsh-shelves-danger',
                    disabled: removeProject?.busy === true,
                    onClick: confirmRemoveProject,
                  },
                  t('remove.confirm'),
                ),
              ],
            },
            h(
              'div',
              { className: 'dsh-shelves-remove' },
              h('div', null, t('remove.desc', { name: removeProject?.name ?? '' })),
              removeProject?.busy ? h('div', { className: 'dsh-shelves-remove-pending', role: 'status' }, t('remove.pending')) : null,
              removeProject?.error ? h('div', { className: 'dsh-shelves-remove-error', role: 'alert' }, removeProject.error) : null,
            ),
          ),
        ),
      );
    }

    // The composer's Workspace menu. Every Workspace arrives as the sidebar draws
    // it — the chosen tile and its name — newest session activity first, so a
    // project you just wrote in leads. The add entry stays the only mutation:
    // this surface picks or creates, it never renames or reorders.
    function WorkspaceMenu(props) {
      const {
        open, anchorRef, selectedId, onPick, onClose, useWorkspaces, useSessions,
        createWorkspace, pickDirectory, readFileBytes, t,
      } = props;
      const workspaces = useWorkspaces((state) => state.items);
      const sessions = useSessions((state) => state) ?? EMPTY_LIST;
      const icons = React.useSyncExternalStore(iconsStore.subscribe, iconsStore.get);
      const [failure, setFailure] = React.useState(null);
      const [busy, setBusy] = React.useState(false);

      // A Workspace's activity is its newest session's input time; a Workspace
      // without one keeps its Host position behind the active ones.
      const ordered = React.useMemo(() => {
        const lastUsed = (workspace) => {
          let latest = 0;
          for (const id of workspace.sessionIds ?? []) {
            const session = sessions.byId?.[id];
            if (session === undefined || session.origin === 'subagent') continue;
            const ms = toMillis(session.updatedAt);
            if (ms > latest) latest = ms;
          }
          return latest;
        };
        return workspaces
          .map((workspace, index) => ({ workspace, index, latest: lastUsed(workspace) }))
          .sort((left, right) => right.latest - left.latest || left.index - right.index)
          .map((row) => row.workspace);
      }, [workspaces, sessions]);

      const items = ordered.map((workspace) => {
        const name = workspaceIconName(workspace);
        return {
          id: workspace.workspaceId,
          label: name,
          icon: h(MenuTile, {
            icon: projectIcon(name, icons[workspace.workspaceId]),
            workspaceId: workspace.workspaceId,
            workspacePath: workspace.path ?? '',
            sessionId: workspace.sessionIds?.[0],
            readFileBytes,
          }),
        };
      });
      const footer = [{
        id: ADD_WORKSPACE,
        label: t('menu.addWorkspace'),
        icon: h(IconPlusOutlineRegular, { size: 16 }),
        disabled: busy,
      }];

      // The owner's pick semantics: adopt the directory, then target it. A
      // failure reopens the same dialog the default picker owns, with retry.
      const add = () => {
        onClose();
        setBusy(true);
        Promise.resolve()
          .then(() => pickDirectory())
          .then((path) => (path === null ? null : createWorkspace({ path })))
          .then((workspace) => {
            if (workspace !== null) onPick(workspace.workspaceId);
          })
          .catch((reason) => setFailure(reason instanceof Error ? reason.message : String(reason)))
          .finally(() => setBusy(false));
      };

      const select = (id) => {
        if (id === ADD_WORKSPACE) add();
        else onPick(id);
      };

      return h(
        React.Fragment,
        null,
        h(Menu, {
          open,
          anchor: null,
          items,
          footer,
          selectedId,
          onSelect: select,
          onClose,
          side: 'bottom',
          portal: true,
          getAnchorRect: () => anchorRef?.current?.getBoundingClientRect() ?? null,
        }),
        h(
          Modal,
          {
            open: failure !== null,
            onClose: () => setFailure(null),
            closeLabel: t('menu.close'),
            title: t('menu.addFailed'),
            footer: h(Button, {
              variant: 'primary',
              onClick: () => {
                setFailure(null);
                add();
              },
            }, t('menu.addRetry')),
          },
          h('div', { role: 'alert' }, failure ?? ''),
        ),
      );
    }

    return {
      inject: ['slots', 'locale', 'uiWorkspace', 'remote', 'remote.workspaceFiles', 'workspaces', 'sessions'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'sidebar-shelves: dictionaries');
        const readFileBytes = (sessionId, path, length, signal) =>
          ctx.remote.workspaceFiles.readBytes(sessionId, path, { range: { length } }, signal);
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
                // Workspace-level removal: unregisters the project, keeps its files and sessions.
                deleteWorkspace: (workspaceId) => ctx.workspaces.delete(workspaceId),
                // Same Host paths the native Session menu uses.
                forkSession: (id) => ctx.uiWorkspace.forkSession(id, undefined, { allowMigration: false }),
                renameSession: async (id, title) => {
                  const result = await ctx.sessions.using(id, { source: 'workspaceOperation' }, (reference) =>
                    reference.binding.session.rename(title),
                  );
                  if (!result.ok) throw new Error(result.error.message);
                },
                getOpenTabs: () => ctx.get('sidebarRight')?.openTabs,
                listFiles: (sessionId, path, signal) => ctx.remote.workspaceFiles.list(sessionId, path, signal),
                readFileBytes,
              }),
            },
            Shelves,
          ),
        );
        ctx.slots.inject('conversation.header.leading', () =>
          ctx.slots.register(
            { name: 'conversation.header.leading', locale: NS, inject: () => ({ readFileBytes }) },
            HeaderTile,
          ),
        );
        ctx.slots.inject('conversation.hero.workspace', () =>
          ctx.slots.register(
            {
              name: 'conversation.hero.workspace',
              priority: -1,
              locale: NS,
              inject: () => ({
                createWorkspace: (input) => ctx.get('workspaces').create(input),
                // The desktop bridge when the shell exposes one, else the Host
                // chooser — the same preference the native picking occupant makes.
                pickDirectory: () => {
                  const desktop = globalThis.__DSH_DIRECTORY_PICKER__;
                  return desktop === undefined ? ctx.uiWorkspace.pickDirectory() : desktop.pick();
                },
                readFileBytes,
              }),
            },
            WorkspaceMenu,
          ),
        );
      },
    };
  },
});
