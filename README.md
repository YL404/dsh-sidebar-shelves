# dsh-sidebar-shelves

English | [中文](#中文)

Two-line session cards for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) sidebar.

- **Project tiles** — every Workspace gets a tile: a name-derived monogram and color, or the emoji, color, or square image file you pick. Icon Composer `.icon` packages work too.
- **Pinning** — pinned sessions lead the list; pinning applies to active sessions, and archiving clears the pin.
- **Context menu** — right-click a card to pin, rename, fork, copy the Session ID, archive it, or remove its project; Shift+F10 opens the same menu from the keyboard.
- **Project menu** — right-click a card's project tile or name to change its icon or remove the project; removal only unregisters the workspace and keeps its folder and sessions.
- **Archiving** — archive a session by hand, or let cards archive themselves after 3, 7, 14, or 30 days. Archived sessions drop to the Archived shelf at the bottom; expanding it scrolls within a capped area.
- **Status markers** — running and waiting markers, plus a terminal marker on sessions that own one.
- **Activity counts** — running background jobs and subagents per session, folded on the Host from the Session's own job records.
- **Recency sorting** — newest input first, and the composer's Workspace menu reuses the same tiles and the same order.
- **Header tile** — the open session's Workspace tile sits just before its title in the conversation header.

## Requirements

- DeepSeek Harness `>=0.2.1-rc.5 <0.3.0` (declared in `engines.dsh`)
- The Web GUI: the client half targets `platform: web`

## Install

CLI:

```sh
dsh plugin --profile desktop add dsh-sidebar-shelves
```

GUI: **Plugins → Install**, enter `dsh-sidebar-shelves`, confirm, then restart the app if the plugin row does not appear.

Uninstall with `dsh plugin --profile desktop remove dsh-sidebar-shelves`, or remove the bundle from **Plugins**.

## Where state lives

| State | Where |
|---|---|
| Settings (tile style, auto-archive days) | browser local storage `dsh:sidebar-shelves:settings` |
| Pins | browser local storage `dsh:sidebar-shelves:pinned` |
| Icon choices | browser local storage `dsh:sidebar-shelves:icons` |
| Job counts | Session projection on the Host, rebuilt from job events |

The plugin makes no network requests and sends no telemetry. Icon images are read from the current Workspace through the Host's workspace-files remote.

## Compatibility

It occupies three slots: `sidebar.workspaces`, `conversation.hero.workspace`, and `conversation.header.leading`. A plugin registering the same slot at a higher priority wins, so uninstall this one if another sidebar plugin takes over.

## License

MIT

## 中文

DeepSeek Harness 侧边栏的会话卡片：每个会话是一张两行卡片。

- **项目图标** — 每个工作区一个图标：按名称生成的字母块与配色，或你选的 emoji、颜色、方形图片；也支持 Icon Composer 的 `.icon` 图标包。
- **置顶** — 置顶会话排在最前，仅适用于活跃会话；归档时会自动取消置顶。
- **右键菜单** — 在会话卡片上右键可置顶、重命名、分叉、复制会话 ID、归档或移除所属项目；键盘上 Shift+F10 打开同一菜单。
- **项目菜单** — 在卡片的项目图标或项目名上右键，可更改项目图标或移除项目；移除只取消工作区注册，文件夹和会话都会保留。
- **归档** — 手动归档，或按 3、7、14、30 天自动归档；归档的会话收进底部的「已归档」，展开后在限定高度内滚动。
- **状态标记** — 运行中、等待中标记，以及带终端会话的终端标记。
- **活动计数** — 每个会话运行中的后台任务与子代理数量，由 Host 端从会话自身的任务记录折叠得出。
- **按最近输入排序** — 输入框的工作区菜单复用同一套图标和同一套顺序。
- **标题前图标** — 打开的会话在标题前显示所属工作区的图标。

安装：

```sh
dsh plugin --profile desktop add dsh-sidebar-shelves
```

或在界面里 **插件 → 安装**，填入 `dsh-sidebar-shelves`。若安装后没有出现插件行，重启应用。

插件不联网、不上报；设置、置顶和图标选择存在浏览器本地存储（`dsh:sidebar-shelves:*`），任务计数由 Host 端的会话投影提供。

## License

MIT
