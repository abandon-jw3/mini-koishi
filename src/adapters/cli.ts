/**
 * Mini-Koishi CLI 适配器
 *
 * 🎓 学习要点：
 * 这是一个用于本地终端测试的适配器。
 * 它演示了适配器的核心职责：
 * 1. 接收输入（这里是终端标准输入）
 * 2. 创建 Session 对象
 * 3. 交给 Context 处理
 * 4. 将回复输出（这里是打印到终端）
 *
 * 有了这个适配器，你不需要连接任何聊天平台，
 * 就能在终端中测试指令和中间件的功能。
 */

import * as readline from 'node:readline';
import { Adapter } from './adapter.js';
import { Session } from '../session.js';
import { Context } from '../core/context.js';

// ============================================================================
// CLIAdapter 类
// ============================================================================

export class CLIAdapter extends Adapter {
  /** readline 接口实例 */
  private _rl: readline.Interface | null = null;

  constructor(ctx: Context) {
    super(ctx, 'cli');
  }

  /**
   * 启动 CLI 适配器
   *
   * 🎓 启动流程：
   * 1. 创建 readline 接口，监听终端输入
   * 2. 每当用户输入一行文本，创建 Session 并交给 ctx 处理
   * 3. Session 的 send 回调会将回复打印到终端
   */
  start(): void {
    // 🎓 使用 Node.js readline 模块监听终端输入
    this._rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '> ',
    });

    console.log('──────────────────────────────────');
    console.log('  🤖 Mini-Koishi CLI 已启动');
    console.log('  输入指令开始交互，Ctrl+C 退出');
    console.log('──────────────────────────────────');
    this._rl.prompt();

    // 🎓 监听每一行输入
    this._rl.on('line', async (input: string) => {
      const trimmed = input.trim();
      if (!trimmed) {
        this._rl?.prompt();
        return;
      }

      // 🎓 Step 1: 创建 Session 对象
      // 这就是适配器的核心工作——将平台输入转化为统一的 Session
      const session = new Session({
        platform: 'cli',        // 平台标识
        userId: 'cli-user',     // 用户 ID
        username: 'CLI 用户',    // 用户昵称
        channelId: 'cli',       // 频道 ID
        content: trimmed,       // 消息内容
        send: (content: string) => {
          // 🎓 send 回调：将回复消息输出到终端
          console.log(`🤖 ${content}`);
        },
      });

      // 🎓 Step 2: 交给 Context 处理
      // 从这里开始，消息会经过事件触发 → 中间件链 → 指令匹配 的完整流程
      await this.ctx.handleMessage(session);

      this._rl?.prompt();
    });

    // 🎓 监听终端关闭（Ctrl+C）
    this._rl.on('close', () => {
      console.log('\n👋 再见！');
    });
  }

  /**
   * 停止 CLI 适配器
   */
  stop(): void {
    if (this._rl) {
      this._rl.close();
      this._rl = null;
    }
  }
}
