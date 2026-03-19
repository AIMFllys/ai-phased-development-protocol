# 🧠 AI Phased Development Protocol

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Skill Version](https://img.shields.io/badge/version-1.0-green.svg)](SKILL.md)
[![Cursor Compatible](https://img.shields.io/badge/Cursor-Compatible-purple.svg)](#-usage)
[![Windsurf Compatible](https://img.shields.io/badge/Windsurf-Compatible-teal.svg)](#-usage)
[![Antigravity Compatible](https://img.shields.io/badge/Antigravity-Compatible-orange.svg)](#-usage)

> **一个 Phase-Gate 状态机驱动的 AI 编程 Skill。核心目的：让 AI 分阶段交付、乖乖等你确认，不再一口气失控输出全套代码。**

[English](#overview) | [中文](#概述)

---

## 概述

你是否遇到过这些问题？

- 🤯 AI 一口气输出几百行代码，改得面目全非
- 🐛 AI 不理解现有架构，上来就重写
- 📁 文件越来越大，维护噩梦
- 😵 修完一个 Bug 又引入三个新 Bug

**AI Phased Development Protocol** 是一个从实战中提炼的 Skill 指令文档，通过 **Phase-Gate 状态机**强制 AI 在每个阶段完成后**停下来等你确认**，彻底解决 AI 编程失控的问题。

## Overview

Have you ever experienced these problems?

- 🤯 AI dumps hundreds of lines of code at once, changing everything beyond recognition
- 🐛 AI rewrites your code without understanding the existing architecture
- 📁 Files keep growing larger, becoming a maintenance nightmare
- 😵 Fixing one bug introduces three new ones

**AI Phased Development Protocol** is a battle-tested Skill document that uses a **Phase-Gate State Machine** to force AI to **stop and wait for your confirmation** after each phase.

---

## ✨ 核心特性 / Key Features

### 🚨 Phase-Gate 状态机

```
┌──────────────────────────────────────────────────────────────┐
│                    PHASE-GATE STATE MACHINE                  │
│                                                              │
│  Phase 1: 需求分析        ──▶ GATE 1 (等待确认)              │
│  Phase 2: 架构 Tree 设计  ──▶ GATE 2 (等待确认)              │
│  Phase 3: 任务步进拆解    ──▶ GATE 3 (等待确认)              │
│  Phase 4: 单步编码执行    ──▶ GATE 4 (等待确认) ──▶ 循环     │
│  Phase 5: 审查与收尾      ──▶ GATE 5 (等待确认)              │
│                                                              │
│  ⛔ 每个 GATE 处必须停止，等待用户输入"确认/继续"             │
└──────────────────────────────────────────────────────────────┘
```

AI 在完成每个阶段后会输出 **标准握手问句** 并停下：

> ✅ Phase 1 已完成。请确认以上分析是否正确，或补充修改意见。确认后我将进入 Phase 2。

### 🎯 三大场景 SOP

| 场景 | 触发词 | 说明 |
|------|--------|------|
| **A. 初始化项目** | "新建项目"、"从零开始" | 从需求沟通到脚手架搭建的完整流程 |
| **B. 修复 Bug** | "报错"、"Bug"、"修复" | 按 Bug 类型分支（UI / 报错 / 隐蔽 Bug） |
| **C. 增加新功能** | "加功能"、"新增" | 从规范理解到分步实现的完整流程 |

### 🔒 血泪教训规范

来自数月 Vibe Coding 实战踩坑的硬约束：

- 📏 **单文件 ≤ 300 行** — 超出必须拆分
- 🔤 **强制 UTF-8** — 中文项目的生命线
- 🔄 **禁止重复代码** — 优先 import 复用
- 🏗️ **先理解再修改** — 禁止盲目重写
- 💾 **每步提醒 commit** — 勤备份，不翻车

---

## 🚀 Usage

### 方式 1: Cursor `.cursorrules`

将 [SKILL.md](SKILL.md) 的内容复制到项目根目录的 `.cursorrules` 文件：

```bash
# 克隆仓库
git clone https://github.com/AIMFllys/ai-phased-development-protocol.git

# 复制到你的项目
cp ai-phased-development-protocol/SKILL.md your-project/.cursorrules
```

### 方式 2: Windsurf / Antigravity Custom Instructions

直接将 `SKILL.md` 的内容粘贴到 IDE 的 **Custom Instructions / System Prompt** 设置中。

### 方式 3: 对话中引用

在 AI 对话中直接引用：

```
请结合 @SKILL.md 进行开发。
```

### 方式 4: 作为 Skill 文件夹

将整个仓库放置到你的 Skills 目录中，IDE 会自动识别 YAML frontmatter 头部。

---

## 🎮 流程控制指令

在使用过程中，你可以随时用以下指令控制 AI 行为：

| 指令 | 效果 |
|------|------|
| `确认` / `继续` | 推进到下一阶段 |
| `跳过` | 跳过当前阶段 |
| `回退` | 返回上一阶段 |
| `全部执行` | 解除状态机限制，连续完成所有步骤 |
| `暂停` | 立即停止，等待新指令 |

---

## 📁 文件结构

```
ai-phased-development-protocol/
├── SKILL.md          ← 核心 Skill 指令文档（可直接用作 .cursorrules）
├── README.md         ← 本文件
├── LICENSE           ← MIT License
└── .gitignore
```

---

## 🛠️ 默认技术栈基准

当用户未指定技术栈时，Skill 会以以下技术栈为默认思考基准（可随时替换）：

| Layer | Technology | Notes |
|-------|------------|-------|
| Framework | Next.js 16 (App Router) | 优先 App Router 文件路由 |
| UI Library | React 18 / 19 | 函数组件 + Hooks |
| Language | TypeScript | 严格模式 |
| Styling | Tailwind CSS v3/v4 | 按项目版本适配 |
| Backend/DB | Supabase | Auth + Postgres + Edge Functions |
| Version Ctrl | Git | 每步 commit |

---

## 🗺️ Roadmap

- [ ] 🌍 English version of SKILL.md
- [ ] 📦 Support for more IDE formats (VS Code Copilot, Trae, Qoder)
- [ ] 🔌 MCP integration for automated phase tracking
- [ ] 🧪 Test scenario templates
- [ ] 🤖 Agent Team patterns (code review agent, debug agent)

---

## 🤝 Contributing

Contributions are welcome! If you have more battle-tested rules or workflow improvements:

1. Fork this repo
2. Create your feature branch (`git checkout -b feat/awesome-rule`)
3. Commit your changes (`git commit -m 'feat: add awesome rule'`)
4. Push to the branch (`git push origin feat/awesome-rule`)
5. Open a Pull Request

---

## 📜 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

## 💡 Credits

This Skill is distilled from months of real-world **Vibe Coding** experience — building production applications with AI IDE assistance. Every rule exists because we hit that wall in practice.

---

**如果这个 Skill 帮到了你，请给个 ⭐ Star 支持一下！**

**If this Skill helps you, please give it a ⭐ Star!**
