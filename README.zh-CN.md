# FloatTodo

轻量 Windows 桌面悬浮待办，支持通过本地 CLI 与 AI Agent 集成。

[English documentation](README.md)

当前为 **V1.3.1 Source Available Software（源码可用软件）候选**，尚未公开发布，不声称为 OSI 批准的开源软件。许可证已选定为 PolyForm Noncommercial License 1.0.0；版权主体为 Peiying Ma，版权年份为 2026。本目录不含安装包。

## 功能

- 悬浮球拖动、Hover 展开、托盘恢复、Pin / Always on Top 和自动背景透明度。
- 任务分组、备注、截止日期及四种状态；同组 To-do 整行拖拽排序，重启保留顺序。
- 本地原子保存、备份和 JSON 导入导出。
- 可选 Todoist 同步、按项目 ID 选择、预览确认与冲突处理。排序只保存在本地。
- AI Agent 通过本地 CLI 排队添加或修改任务；不内置大模型调用或 ChatGPT 直连接口。

## 安装与开发

尚无公开下载地址。计划提供 Windows x64 Portable / Setup，两者共享用户数据目录；Portable 不会将数据保存在 EXE 旁。旧版升级前先退出托盘并导出备份。

使用 Windows PowerShell、Node.js 和 npm。历史工具环境为 Node 24.21.0 / npm 11.19.0，依赖由 lockfile 固定：

```powershell
npm ci
$env:FLOATTODO_DATA_DIR = "$PWD\artifacts\dev-profile"
npm run dev
# 退出开发应用后构建
npm run typecheck
npm run build
npm run dist:win
```

产物输出至 `release/v1.3.1/`。另一终端中的 CLI 必须使用相同的 FLOATTODO_DATA_DIR。本轮没有安装依赖或重新打包。

## Agent 与 Todoist

保持应用运行，然后在相同数据目录下执行：

```powershell
npm run todo -- add --title "整理每周计划" --category work --command-id weekly-plan-001 --wait 8000
npm run todo -- status --command-id weekly-plan-001
```

queued 不等于 applied；超时仍可能在队列中。同一操作重试沿用同一 command ID。更多命令见 `node cli/todo.cjs help`。

Todoist Token 只在本机设置中输入，通过 safeStorage 加密保存。先选择项目并核对预览，再确认同步。切换项目受到队列与旧任务隔离保护；自动同步约每 45 秒检查且可能退避，不保证即时。既有报告记录过 Demo 项目真实联动成功，但全面云端边界尚未验证。不要把 Token 发到聊天或反馈中。

## 数据与限制

默认目录为 `%APPDATA%\FloatTodo-v1.2`。任务与 JSON 备份为明文；凭据单独加密。不要上传任务库、备份或会话目录。导入会覆盖任务，先确认并备份；导入不直接恢复云端写授权。

实测环境为 Windows 10 build 18362 x64、250% DPI。Windows 11、多屏、其他缩放及 Setup 实际安装/卸载尚未完整验证。现有候选安装包未签名，可能出现 SmartScreen 或未知发布者提示；应核对来源与 SHA256，不要关闭系统防护。不支持跨组/跨状态拖拽，无自动在线升级。

截图位置待添加经过审核的合成数据截图，本目录不使用私人录制截图。测试与验证范围见 [TESTING](docs/TESTING.md)，第三方许可见 [声明](THIRD_PARTY_NOTICES.md)。贡献与反馈见 [CONTRIBUTING](CONTRIBUTING.md)。

## 许可证与商业授权

**许可证：**[PolyForm Noncommercial License 1.0.0](LICENSE)，SPDX：PolyForm-Noncommercial-1.0.0。

**商业使用：**超出标准许可证许可范围的商业使用，需要事先取得单独书面授权，参见 [商业授权说明](COMMERCIAL_LICENSE.md)。

标准许可证允许非商业用途，并包含其规定的个人用途以及慈善组织、教育机构、公共研究机构、公共安全或健康组织、环保组织和政府机构用途；该机构用途许可不因资金来源或由资助产生的义务而改变。本摘要不撤销这些许可、不增加限制，也不限制合理使用权。分发时须提供许可证正文或其网址，并保留许可方提供的 Required Notice 行。

版权声明：Copyright 2026 Peiying Ma。正式 Required Notice 及原创项目范围见 [NOTICE.md](NOTICE.md)。版权已确认，不代表已批准公开或授出单独商业授权。第三方组件适用各自原许可证。
