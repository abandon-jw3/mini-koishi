/**
 * Mini-Koishi 上下文 (Context)
 *
 * 🎓 学习要点：
 * Context 是 Koishi 的**绝对核心**——几乎所有 API 都挂载在 Context 上。
 *
 * 核心设计思想：
 *
 * 1. **Context 是一棵树**
 *    App（根上下文）→ 插件A的子上下文 → 插件A内嵌套插件B的子上下文
 *    每个插件都有自己的上下文，形成层级关系。
 *
 * 2. **Context 是 API 的统一入口**
 *    ctx.on()       → 注册事件监听
 *    ctx.command()   → 注册指令
 *    ctx.middleware() → 注册中间件
 *    ctx.plugin()    → 加载插件
 *    ctx.service     → 访问服务
 *    所有操作通过 ctx 完成，无需直接操作内部类。
 *
 * 3. **Context 管理生命周期**
 *    每个 ctx 持有一个 Lifecycle 实例。
 *    通过 ctx 注册的所有副作用（事件、指令等）都会被 ctx.lifecycle 收集。
 *    当 ctx.dispose() 调用时，所有副作用自动清理。
 *
 * 4. **子上下文共享根上下文的核心组件**
 *    所有子上下文的事件、指令、中间件都注册到根上下文的管理器中，
 *    但 dispose 函数绑定到子上下文的 lifecycle 上——
 *    这样既能全局共享，又能独立清理。
 */

import { EventEmitter, type Listener, type Dispose } from "./events.js";
import { ServiceManager } from "./service.js";
import { Lifecycle } from "./lifecycle.js";
import { type Plugin, getPluginName, getPluginApply } from "./plugin.js";
import { CommandManager, type Command } from "../command.js";
import { MiddlewareManager, type MiddlewareFunction } from "../middleware.js";
import { type Session } from "../session.js";

// ============================================================================
// Context 类
// ============================================================================

export class Context {
  /**
   * 根上下文引用
   *
   * 🎓 所有上下文最终都指向同一个根上下文（App 实例）。
   * 根上下文持有全局共享的组件：事件系统、指令管理器、中间件管理器等。
   * 子上下文通过 root 引用来访问这些共享资源。
   */
  root: Context;

  /**
   * 父上下文引用（根上下文的 parent 为 null）
   */
  parent: Context | null;

  /**
   * 生命周期管理器（每个上下文独有）
   *
   * 🎓 这是实现"插件隔离"的关键：
   * 虽然事件/指令注册到全局管理器中，
   * 但 dispose 函数被收集到当前上下文的 lifecycle 中。
   * 这样卸载插件时只清理该插件注册的东西。
   */
  lifecycle: Lifecycle;

  /**
   * 以下是根上下文持有的全局共享组件
   * 子上下文通过 this.root 来访问它们
   */

  /** 事件发射器（全局共享） */
  protected _events: EventEmitter;

  /** 服务管理器（全局共享） */
  protected _services: ServiceManager;

  /** 指令管理器（全局共享） */
  protected _commands: CommandManager;

  /** 中间件管理器（全局共享） */
  protected _middlewares: MiddlewareManager;

  /** 子上下文列表（用于追踪插件树） */
  private _children: Context[] = [];

  /** 当前上下文加载的插件名称 */
  pluginName: string;

  constructor(parent?: Context) {
    if (parent) {
      // 🎓 子上下文：共享根上下文的组件，但有独立的 lifecycle
      this.root = parent.root;
      this.parent = parent;
      this._events = parent.root._events;
      this._services = parent.root._services;
      this._commands = parent.root._commands;
      this._middlewares = parent.root._middlewares;
    } else {
      // 🎓 根上下文：创建所有共享组件
      this.root = this;
      this.parent = null;
      this._events = new EventEmitter();
      this._services = new ServiceManager(this);
      this._commands = new CommandManager();
      this._middlewares = new MiddlewareManager();
    }

    // 每个上下文都有独立的生命周期管理器
    this.lifecycle = new Lifecycle();
    this.pluginName = "root";
  }

  // ==========================================================================
  // 事件相关 API（代理到 EventEmitter）
  // ==========================================================================

  /**
   * 注册事件监听器
   *
   * 🎓 关键设计：
   * 1. 事件注册到全局的 EventEmitter 中（所有上下文共享）
   * 2. 返回的 dispose 函数被收集到当前上下文的 lifecycle 中
   * 3. 这样当插件卸载（ctx.dispose()）时，会自动取消所有监听
   *
   * @param event - 事件名称
   * @param listener - 监听器函数
   * @param prepend - 是否前置
   * @returns dispose 函数
   */
  on(event: string, listener: Listener, prepend = false): Dispose {
    const dispose = this._events.on(event, listener, prepend);
    // 🎓 核心：收集 dispose 到当前上下文的 lifecycle
    this.lifecycle.collect(dispose);
    return dispose;
  }

  /**
   * 注册一次性事件监听器
   */
  once(event: string, listener: Listener): Dispose {
    const dispose = this._events.once(event, listener);
    this.lifecycle.collect(dispose);
    return dispose;
  }

  /**
   * 触发事件（广播）
   */
  emit(event: string, ...args: any[]): void {
    this._events.emit(event, ...args);
  }

  /**
   * 触发事件（短路）
   */
  bail(event: string, ...args: any[]): any {
    return this._events.bail(event, ...args);
  }

  /**
   * 触发事件（并行）
   */
  async parallel(event: string, ...args: any[]): Promise<void> {
    await this._events.parallel(event, ...args);
  }

  // ==========================================================================
  // 插件相关 API
  // ==========================================================================

  /**
   * 加载插件
   *
   * 🎓 这是 Koishi 模块化的核心方法，加载流程：
   *
   * 1. 获取插件的 apply 函数和名称
   * 2. 创建一个新的子上下文（隔离环境）
   * 3. 将子上下文传给插件的 apply 函数
   * 4. 插件在子上下文中注册的所有东西都绑定到子上下文的 lifecycle
   * 5. 将子上下文的 dispose 收集到当前上下文——形成级联清理
   *
   * @param plugin - 插件（函数或对象）
   * @param config - 插件配置（可选）
   * @returns 子上下文（可用于后续卸载该插件）
   */
  plugin(plugin: Plugin, config?: any): Context {
    const apply = getPluginApply(plugin);
    const name = getPluginName(plugin);

    // 🎓 Step 1: 为插件创建独立的子上下文
    const childCtx = this.extend();
    childCtx.pluginName = name;

    console.log(`[plugin] 加载插件: ${name}`);

    try {
      // 🎓 Step 2: 执行插件的 apply 函数
      // 插件在 childCtx 上注册的所有东西都绑定到 childCtx.lifecycle
      apply(childCtx, config);
    } catch (error) {
      console.error(`[plugin] 插件 ${name} 加载失败:`, error);
    }

    // 🎓 Step 3: 将子上下文的 dispose 收集到当前上下文
    // 这样当父上下文被销毁时，子上下文也会被级联销毁
    this.lifecycle.collect(() => {
      childCtx.dispose();
    });

    return childCtx;
  }

  /**
   * 创建子上下文
   *
   * 🎓 这是一个底层方法，plugin() 内部会调用它。
   * 子上下文共享根上下文的事件/指令/中间件管理器，
   * 但有独立的 lifecycle。
   *
   * @returns 新的子上下文
   */
  extend(): Context {
    const child = new Context(this);
    this._children.push(child);
    return child;
  }

  // ==========================================================================
  // 指令相关 API
  // ==========================================================================

  /**
   * 注册指令
   *
   * 🎓 指令注册到全局 CommandManager，但 dispose 绑定到当前上下文。
   * 这意味着：
   * - 所有上下文注册的指令都可以被匹配到
   * - 但当某个插件卸载时，它注册的指令会自动移除
   *
   * @param def - 指令定义字符串（如 'echo <message>'）
   * @param description - 指令描述
   * @returns Command 实例（支持链式调用）
   */
  command(def: string, description: string): Command {
    const command = this._commands.register(def, description);

    // 🎓 收集 dispose 函数——卸载时自动移除此指令
    this.lifecycle.collect(() => {
      this._commands.remove(command.name);
    });

    return command;
  }

  // ==========================================================================
  // 中间件相关 API
  // ==========================================================================

  /**
   * 注册中间件
   *
   * @param middleware - 中间件函数
   * @param prepend - 是否前置
   * @returns dispose 函数
   */
  middleware(middleware: MiddlewareFunction, prepend = false): Dispose {
    const dispose = this._middlewares.add(middleware, prepend);
    this.lifecycle.collect(dispose);
    return dispose;
  }

  // ==========================================================================
  // 服务相关 API
  // ==========================================================================

  /**
   * 声明一个服务
   *
   * 🎓 静态方法，通常在模块顶层调用：
   *   Context.service('database')
   *
   * 声明后可以通过 ctx.getService('database') 访问
   *
   * @param name - 服务名称
   */
  static service(name: string): void {
    // 🎓 注意：这里只是记录服务名称到一个静态集合中
    // 实际的服务注册在实例的 ServiceManager 中完成
    Context._declaredServices.add(name);
  }

  /** 静态存储已声明的服务名称 */
  private static _declaredServices: Set<string> = new Set();

  /**
   * 为当前上下文提供一个服务
   *
   * @param name - 服务名称
   * @param instance - 服务实例
   */
  provide(name: string, instance: any): void {
    this._services.set(name, instance);

    // 🎓 收集 dispose——卸载时自动移除此服务
    this.lifecycle.collect(() => {
      this._services.set(name, null);
    });
  }

  /**
   * 获取服务实例
   *
   * @param name - 服务名称
   * @returns 服务实例
   */
  getService(name: string): any {
    return this._services.get(name);
  }

  /**
   * 声明依赖并等待就绪
   *
   * 🎓 inject 的工作方式：
   * 1. 检查所有声明的依赖是否都已可用
   * 2. 如果是，立即执行回调
   * 3. 如果不是，监听 "service" 事件，等待依赖就绪后再执行
   *
   * 这实现了**延迟加载**和**动态依赖**：
   * 插件不需要关心依赖的加载顺序，
   * 只要声明"我需要什么"，框架会在合适的时机通知你。
   *
   * @param deps - 依赖的服务名称列表
   * @param callback - 依赖就绪后执行的回调
   */
  inject(deps: string[], callback: (ctx: Context) => void): void {
    // 检查依赖是否全部就绪
    const checkDeps = () => deps.every((dep) => this._services.has(dep));

    if (checkDeps()) {
      // 所有依赖已就绪，立即执行
      callback(this);
    }

    // 🎓 监听 service 事件，依赖变更时重新检查
    this.on("service", () => {
      if (checkDeps()) {
        callback(this);
      }
    });
  }

  // ==========================================================================
  // 生命周期 API
  // ==========================================================================

  /**
   * 销毁当前上下文
   *
   * 🎓 dispose 的级联效果：
   * 1. 触发 'dispose' 事件
   * 2. 执行 lifecycle 中收集的所有 dispose 函数
   * 3. 子上下文（嵌套插件）也会被级联销毁
   * 4. 从父上下文的 children 列表中移除自己
   */
  dispose(): void {
    if (this.lifecycle.isDisposed) return;

    console.log(`[context] 销毁上下文: ${this.pluginName}`);

    // 触发 dispose 事件
    this.emit("dispose");

    // 执行所有清理函数
    this.lifecycle.dispose();

    // 从父上下文中移除
    if (this.parent) {
      const index = this.parent._children.indexOf(this);
      if (index !== -1) {
        this.parent._children.splice(index, 1);
      }
    }
  }

  // ==========================================================================
  // 消息处理
  // ==========================================================================

  /**
   * 处理收到的会话消息
   *
   * 🎓 这是消息处理的核心入口，完整流程：
   *
   *   消息到达
   *     ↓
   *   触发 'message' 事件
   *     ↓
   *   执行中间件链
   *     ↓
   *   （中间件链末尾）匹配并执行指令
   *     ↓
   *   指令发送回复
   *
   * 中间件可以在任何环节拦截消息，不调用 next() 即可终止处理。
   *
   * @param session - 会话对象
   */
  async handleMessage(session: Session): Promise<void> {
    // 🎓 Step 1: 触发 message 事件（用于日志、统计等纯通知场景）
    this.emit("message", session);

    // 🎓 Step 2: 经过中间件链，最终处理函数是指令匹配
    await this._middlewares.run(session, async (session) => {
      // 🎓 这个 finalHandler 在所有中间件执行完后调用
      // 它尝试匹配用户输入到已注册指令
      const matched = await this._commands.execute(session.content, session);

      if (!matched) {
        // 没有匹配到任何指令——在实际 Koishi 中会有更多处理
        // 这里简单触发一个事件通知
        this.emit("message/unhandled", session);
      }
    });
  }

  /**
   * 获取指令管理器（用于 help 等功能）
   */
  get commands(): CommandManager {
    return this._commands;
  }
}
