/**
 * Mini-Koishi 中间件系统 (Middleware)
 *
 * 🎓 学习要点：
 * Koishi 的中间件系统采用 **洋葱模型**（类似 Koa）：
 *
 *                    ┌─────────────────────┐
 *           请求 ──→ │  中间件 1 (外层)     │
 *                    │  ┌───────────────┐  │
 *                    │  │ 中间件 2       │  │
 *                    │  │ ┌───────────┐ │  │
 *                    │  │ │ 中间件 3   │ │  │
 *                    │  │ │  ↓ next() │ │  │
 *                    │  │ └───────────┘ │  │
 *                    │  │               │  │
 *                    │  └───────────────┘  │
 *                    │                     │
 *           响应 ←── │                     │
 *                    └─────────────────────┘
 *
 * 每个中间件接收 (session, next) 两个参数：
 * - session: 当前会话
 * - next: 调用下一个中间件的函数
 *
 * 中间件可以：
 * 1. 在调用 next() 之前做预处理
 * 2. 调用 next() 将控制权交给下一个中间件
 * 3. 在 next() 返回后做后处理
 * 4. 不调用 next()，直接返回（拦截请求）
 */

import { Session } from './session.js';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * next 函数类型
 * 调用后会执行中间件链中的下一个中间件
 */
export type NextFunction = () => Promise<void>;

/**
 * 中间件函数类型
 *
 * 🎓 中间件签名 (session, next) 的设计哲学：
 * - session 提供了消息的完整上下文
 * - next 让你决定是否继续处理
 * - 不调用 next = 拦截此消息（后面的中间件和指令都不会执行）
 *
 * 示例：
 *   // 记录所有消息的中间件
 *   ctx.middleware((session, next) => {
 *     console.log(`[${session.userId}]: ${session.content}`);
 *     return next(); // 继续处理
 *   });
 *
 *   // 过滤敏感词的中间件
 *   ctx.middleware((session, next) => {
 *     if (session.content.includes('敏感词')) {
 *       session.send('请文明用语！');
 *       return; // 不调用 next()，拦截此消息
 *     }
 *     return next();
 *   });
 */
export type MiddlewareFunction = (
  session: Session,
  next: NextFunction
) => void | Promise<void>;

// ============================================================================
// MiddlewareManager 类
// ============================================================================

export class MiddlewareManager {
  /**
   * 中间件列表（按执行顺序排列）
   *
   * 🎓 中间件的执行顺序很重要：
   * - 普通中间件按注册顺序执行
   * - prepend 的中间件会插入到列表头部，最先执行
   * 这让你可以控制中间件的优先级
   */
  private _middlewares: MiddlewareFunction[] = [];

  /**
   * 注册中间件
   *
   * @param middleware - 中间件函数
   * @param prepend - 是否前置插入（高优先级）
   * @returns dispose 函数，调用后移除该中间件
   */
  add(middleware: MiddlewareFunction, prepend = false): () => void {
    if (prepend) {
      this._middlewares.unshift(middleware);
    } else {
      this._middlewares.push(middleware);
    }

    // 返回 dispose 函数
    return () => {
      this.remove(middleware);
    };
  }

  /**
   * 移除中间件
   *
   * @param middleware - 要移除的中间件函数
   */
  remove(middleware: MiddlewareFunction): void {
    const index = this._middlewares.indexOf(middleware);
    if (index !== -1) {
      this._middlewares.splice(index, 1);
    }
  }

  /**
   * 执行中间件链
   *
   * 🎓 这是洋葱模型的核心实现：
   *
   * 假设有 3 个中间件 [A, B, C]，执行过程是：
   * 1. 调用 A(session, nextA)
   * 2. A 内部调用 nextA() → 触发 B(session, nextB)
   * 3. B 内部调用 nextB() → 触发 C(session, nextC)
   * 4. C 内部调用 nextC() → 触发最终处理（指令匹配等）
   * 5. 控制权逐层返回：C → B → A
   *
   * 实现方式是构造一个递归的 next 函数链。
   *
   * @param session - 当前会话
   * @param finalHandler - 最终处理函数（所有中间件执行完后调用）
   */
  async run(
    session: Session,
    finalHandler?: (session: Session) => Promise<void>
  ): Promise<void> {
    // 🎓 复制中间件列表，避免执行过程中列表被修改
    const middlewares = [...this._middlewares];

    /**
     * 构造递归的 dispatch 函数
     *
     * 🎓 这是洋葱模型的经典实现方式：
     * dispatch(i) 执行第 i 个中间件，
     * 并将 dispatch(i+1) 作为 next 函数传入。
     * 当 i 超出范围时，执行 finalHandler。
     */
    const dispatch = async (index: number): Promise<void> => {
      // 所有中间件都执行完了，执行最终处理
      if (index >= middlewares.length) {
        if (finalHandler) {
          await finalHandler(session);
        }
        return;
      }

      const middleware = middlewares[index]!;

      // 🎓 关键：next 函数就是 dispatch(index + 1)
      // 中间件调用 next() 时，就会触发下一个中间件
      const next: NextFunction = () => dispatch(index + 1);

      await middleware(session, next);
    };

    // 从第 0 个中间件开始执行
    await dispatch(0);
  }

  /**
   * 获取已注册中间件数量
   */
  get count(): number {
    return this._middlewares.length;
  }
}
