# Mousai Workspace · Fork Policy

`mousai-workspace-desktop` 是 Hermes 的完整 fork。本文件记录 Mousai workspace 层的长期工程约定，与 upstream 继承的 `AGENTS.md`（Hermes Development Guide）分层共存：

> upstream 升级可能覆盖或冲突 `AGENTS.md`，本文件位于 Mousai 命名空间，不受升级影响。

## Upstream 关系

- **upstream** = `https://github.com/NousResearch/hermes-agent.git`（必须保留，不得移除或改名）
- **origin** = `https://github.com/mousaiann53/mousai-workspace-desktop.git`
- 升级分支：`upgrade/hermes-*`

## 功能实现优先级

Mousai workspace 功能优先实现为（按 foot-print 从小到大）：

1. 独立 route
2. 独立 component
3. Domain Adapter
4. WorkBridge Adapter
5. theme / i18n extension
6. small patch

尽量减少对 upstream core 的修改。patch 必须范围单一、可解释、可回滚。

## 升级流程

每次 upstream 升级使用 `upgrade/hermes-*` 分支，遵循 `HERMES_UPGRADE_CHECKLIST.md`。

> **FOLLOW-UP**: `HERMES_UPGRADE_CHECKLIST.md` 尚未建立。建立前，每次升级至少完成：
>
> 1. 升级前记录 upstream diff 范围（`git fetch upstream` + 对比 tag/commit）
> 2. 升级后人工解决 `AGENTS.md` 等 upstream 继承文件与本 fork 的合并冲突
> 3. 全量测试 + 桌面端启动回归
> 4. 由 Mousai 验收后合入

## 桌面端规则

`apps/desktop/AGENTS.md` 是 desktop 包的权威规则，本文件不重复其内容。
