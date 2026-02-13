# 🤖 Mini-Koishi

> 一个简化版的 [Koishi.js](https://koishi.chat) 框架实现，用于学习和理解 Koishi 的核心设计原理。

## ✨ 特性

通过实现 Koishi 八大核心模块，深入理解现代聊天机器人框架的设计思想：

| 模块             | 文件                    | 学习目标                                         |
| ---------------- | ----------------------- | ------------------------------------------------ |
| **EventEmitter** | `src/core/events.ts`    | 发布-订阅模式、`bail` 短路 / `parallel` 并行语义 |
| **Context**      | `src/core/context.ts`   | 组合式 API、子上下文隔离、统一 API 入口          |
| **Plugin**       | `src/core/plugin.ts`    | 模块化、生命周期管理、热卸载                     |
| **Service**      | `src/core/service.ts`   | IoC 控制反转、依赖注入                           |
| **Lifecycle**    | `src/core/lifecycle.ts` | disposables 自动清理模式                         |
| **Command**      | `src/command.ts`        | DSL 指令解析、参数/选项系统                      |
| **Middleware**   | `src/middleware.ts`     | 洋葱模型、递归 dispatch                          |
| **Adapter**      | `src/adapters/cli.ts`   | 跨平台抽象、消息流转                             |

## 📁 项目结构

```
mini-koishi/
├── src/
│   ├── core/               # 核心层
│   │   ├── events.ts        # 事件系统 (emit / bail / parallel)
│   │   ├── context.ts       # 上下文 (框架中枢)
│   │   ├── plugin.ts        # 插件类型定义
│   │   ├── service.ts       # 服务注入 (IoC)
│   │   └── lifecycle.ts     # 生命周期管理
│   ├── command.ts           # 指令系统
│   ├── middleware.ts        # 中间件 (洋葱模型)
│   ├── session.ts           # 会话模型
│   ├── app.ts               # App 入口类
│   ├── index.ts             # 统一导出
│   └── adapters/
│       ├── adapter.ts       # 适配器基类
│       └── cli.ts           # CLI 适配器 (终端测试)
└── examples/
    ├── basic.ts             # 完整使用示例
    └── echo-plugin.ts       # 示例插件集合
```

## 🚀 快速开始

### 安装依赖

```bash
npm install
```

### 运行示例

```bash
npm run example
```

启动后在终端中输入指令：

```
> help              # 查看所有可用指令
> echo hello world  # 回声：hello world
> repeat hi         # 重复 3 次：hi
> hello 小明        # 打招呼：你好，小明！
> count             # 计数器 +1
> status            # 查看应用状态
```

## 📖 核心概念

### 1. Context (上下文)

Context 是框架的中枢，所有 API 都通过它访问。每个插件拥有独立的子上下文，实现隔离和独立卸载。

```typescript
const app = new App(); // App 是根 Context

// 子上下文共享全局的事件/指令系统，但有独立的生命周期
app.plugin((ctx) => {
  ctx.command("hello", "打招呼").action(() => "Hello!");
  ctx.on("message", (session) => {
    /* ... */
  });
  // 插件卸载时，以上注册的指令和监听器会自动清理
});
```

### 2. Plugin (插件)

插件是功能封装的基本单元，支持函数形式和对象形式：

```typescript
// 函数形式
function myPlugin(ctx: Context, config?: any) {
  ctx.command("test", "测试指令").action(() => "OK");
}

// 对象形式（可携带名称）
const myPlugin = {
  name: "my-plugin",
  apply(ctx: Context) {
    ctx.command("test", "测试指令").action(() => "OK");
  },
};

app.plugin(myPlugin, {
  /* 配置项 */
});
```

### 3. Middleware (中间件)

采用洋葱模型，每个中间件可以决定是否继续处理：

```typescript
ctx.middleware((session, next) => {
  console.log("收到消息:", session.content);
  // 调用 next() 继续处理；不调用则拦截
  return next();
});
```

### 4. Service (服务)

IoC 风格的服务注册与依赖注入：

```typescript
// 提供服务
ctx.provide("database", myDbInstance);

// 使用服务
const db = ctx.getService("database");

// 声明依赖，等待就绪
ctx.inject(["database"], (ctx) => {
  // 数据库服务可用时才执行
});
```

### 5. 消息处理流程

```
终端输入 → CLI Adapter → Session → emit("message")
                                        ↓
                                    中间件链 (logger → ...)
                                        ↓ next()
                                    指令匹配 (echo / hello / ...)
                                        ↓
                                    action() 返回回复
                                        ↓
                                    Session.send() → 终端输出
```

## 🔗 对比 Koishi.js

| 特性              | Koishi.js                 | Mini-Koishi           |
| ----------------- | ------------------------- | --------------------- |
| Context 上下文    | ✅ 完整实现               | ✅ 简化实现           |
| Plugin 插件       | ✅ 函数/类/对象           | ✅ 函数/对象          |
| Service 服务      | ✅ Proxy + 声明合并       | ✅ Map + getter       |
| Events 事件       | ✅ emit/bail/parallel     | ✅ emit/bail/parallel |
| Command 指令      | ✅ 子指令/权限/国际化     | ✅ 基础参数/选项      |
| Middleware 中间件 | ✅ 洋葱模型               | ✅ 洋葱模型           |
| Adapter 适配器    | ✅ QQ/Discord/Telegram... | ✅ CLI                |
| Database 数据库   | ✅ ORM                    | ❌ 未实现             |
| Console 控制台    | ✅ Web UI                 | ❌ 未实现             |
| I18n 国际化       | ✅                        | ❌ 未实现             |

## 📚 推荐阅读顺序

如果你想深入理解框架原理，建议按以下顺序阅读源码（每个文件都有详细的中文注释）：

1. `src/core/events.ts` — 事件系统基础
2. `src/core/lifecycle.ts` — disposables 清理模式
3. `src/core/plugin.ts` — 插件类型
4. `src/core/service.ts` — IoC 服务容器
5. `src/core/context.ts` — ⭐ **核心枢纽**
6. `src/middleware.ts` — 洋葱模型
7. `src/command.ts` — 指令解析
8. `src/adapters/cli.ts` — 适配器桥接

## 📄 License

MIT
