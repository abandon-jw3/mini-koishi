/**
 * Mini-Koishi 适配器基类 (Adapter)
 *
 * 🎓 学习要点：
 * 适配器是 Koishi 实现"跨平台"的关键抽象层。
 *
 * 在 Koishi 中，每个聊天平台（QQ、Telegram、Discord 等）都有一个对应的适配器。
 * 适配器负责：
 * 1. 连接到目标平台（WebSocket、轮询等）
 * 2. 将平台特定的消息格式转换为统一的 Session 对象
 * 3. 将框架的回复消息转换为平台特定的格式并发送
 *
 * 这种设计让核心框架完全不需要关心具体平台的细节，
 * 只需要处理统一的 Session 对象即可。
 *
 *   平台消息 → Adapter → Session → Context → 中间件 → 指令 → 回复
 *                                                              ↓
 *   平台消息 ← Adapter ←────────────────────────────────── Session.send()
 */

import { Context } from '../core/context.js';

// ============================================================================
// Adapter 基类
// ============================================================================

export abstract class Adapter {
  /** 适配器所属的上下文 */
  protected ctx: Context;

  /** 适配器名称（同时也是平台标识） */
  name: string;

  constructor(ctx: Context, name: string) {
    this.ctx = ctx;
    this.name = name;
  }

  /**
   * 启动适配器
   *
   * 🎓 由各适配器子类实现：
   * - CLI 适配器：开始监听终端输入
   * - QQ 适配器：连接 WebSocket
   * - Discord 适配器：启动 Gateway 连接
   */
  abstract start(): void | Promise<void>;

  /**
   * 停止适配器
   *
   * 🎓 清理连接、释放资源
   */
  abstract stop(): void | Promise<void>;
}
