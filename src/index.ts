/**
 * Mini-Koishi 框架入口
 *
 * 统一导出所有模块，方便外部使用：
 *   import { App, Context, Session, Command } from './src/index.js';
 */

// 核心模块
export { Context } from './core/context.js';
export { EventEmitter, type Listener, type Dispose } from './core/events.js';
export { ServiceManager } from './core/service.js';
export { Lifecycle } from './core/lifecycle.js';
export {
  type Plugin,
  type PluginFunction,
  type PluginObject,
  getPluginName,
  getPluginApply,
} from './core/plugin.js';

// 交互模块
export { Session } from './session.js';
export { Command, CommandManager, type CommandAction, type ParsedArgs } from './command.js';
export { MiddlewareManager, type MiddlewareFunction, type NextFunction } from './middleware.js';

// 适配器
export { Adapter } from './adapters/adapter.js';
export { CLIAdapter } from './adapters/cli.js';

// 应用入口
export { App, type AppConfig } from './app.js';
