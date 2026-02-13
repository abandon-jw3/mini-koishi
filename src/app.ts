/**
 * Mini-Koishi App 入口类
 *
 * 🎓 学习要点：
 * App 继承自 Context，是整个框架的顶层入口。
 *
 * 在 Koishi 中，App 就是根上下文（root context）。
 * App = Context + 应用生命周期管理（start/stop）
 *
 * 使用方式：
 *   const app = new App();
 *   app.plugin(myPlugin);          // 加载插件
 *   app.command('hello', '打招呼'); // 注册指令
 *   app.start();                   // 启动应用
 */

import { Context } from './core/context.js';
import { CLIAdapter } from './adapters/cli.js';

// ============================================================================
// App 类
// ============================================================================

export class App extends Context {
  /** CLI 适配器实例 */
  private _adapter: CLIAdapter | null = null;

  /** 应用配置 */
  private _config: AppConfig;

  constructor(config?: Partial<AppConfig>) {
    // 🎓 App 调用 Context 构造器时不传 parent
    // 这使它成为根上下文（root context）
    super();

    this._config = {
      prefix: config?.prefix || '',
      ...config,
    };

    // 🎓 注册内置的 help 指令
    this._registerBuiltinCommands();
  }

  /**
   * 启动应用
   *
   * 🎓 启动流程：
   * 1. 创建并启动 CLI 适配器
   * 2. 触发 'ready' 事件通知所有插件
   * 3. 应用进入就绪状态
   */
  async start(): Promise<void> {
    // 🎓 Step 1: 创建 CLI 适配器
    this._adapter = new CLIAdapter(this);

    // 将适配器注册为服务（这样插件可以通过 ctx.getService('adapter') 访问）
    this.provide('adapter', this._adapter);

    // 🎓 Step 2: 启动适配器
    await this._adapter.start();

    // 🎓 Step 3: 触发 ready 事件
    // 所有在 ctx.on('ready', ...) 中注册的回调都会被执行
    // 使用 parallel 并行触发，让所有插件的初始化并行进行
    await this.parallel('ready');
  }

  /**
   * 停止应用
   *
   * 🎓 停止流程：
   * 1. 触发 'dispose' 事件
   * 2. 停止适配器
   * 3. 清理所有资源
   */
  async stop(): Promise<void> {
    console.log('[app] 正在停止...');

    // 停止适配器
    if (this._adapter) {
      await this._adapter.stop();
    }

    // 销毁根上下文（级联销毁所有子上下文和插件）
    this.dispose();

    console.log('[app] 已停止');
  }

  /**
   * 注册内置指令
   *
   * 🎓 Koishi 内置了一些基础指令，如 help。
   * 这里我们也注册一个内置的 help 指令。
   */
  private _registerBuiltinCommands(): void {
    // help 指令：列出所有已注册的指令
    this.command('help', '显示帮助信息')
      .action((_opts, _args, _session) => {
        return this.commands.getHelp();
      });
  }
}

// ============================================================================
// 类型定义
// ============================================================================

export interface AppConfig {
  /** 指令前缀（如 '/'，留空表示无前缀） */
  prefix: string;
}
