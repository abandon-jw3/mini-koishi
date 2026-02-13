/**
 * Mini-Koishi 事件系统 (EventEmitter)
 *
 * 🎓 学习要点：
 * Koishi 的事件系统与 Node.js 原生 EventEmitter 最大的区别在于：
 * 1. 支持 bail（短路）语义：事件监听器可以返回值，一旦返回非空值就停止后续监听器
 * 2. 支持 parallel（并行）语义：所有监听器并行执行
 * 3. 监听器有优先级（prepend）
 * 4. on() 返回 dispose 函数，而不是返回 this
 *
 * 这种设计让事件系统不仅仅是"通知"，还可以做"拦截"和"决策"。
 */

// ============================================================================
// 类型定义
// ============================================================================

/** 事件监听器函数类型 */
export type Listener = (...args: any[]) => any;

/** dispose 函数，调用后取消监听 */
export type Dispose = () => void;

// ============================================================================
// EventEmitter 类
// ============================================================================

export class EventEmitter {
  /**
   * 事件监听器存储映射
   * key: 事件名称
   * value: 监听器数组（按注册顺序排列，prepend 的在前面）
   *
   * 🎓 Koishi 用 Map 而不是普通对象来存储事件，
   *    这样可以支持任意类型的事件名（包括 Symbol）
   */
  private _listeners: Map<string, Listener[]> = new Map();

  /**
   * 注册事件监听器
   *
   * 🎓 核心设计：返回 dispose 函数
   * 与 Node.js EventEmitter 不同，Koishi 的 on() 返回的是一个"取消订阅"函数。
   * 这种设计非常优雅——你不需要保存监听器的引用就能取消它，
   * 而且 dispose 函数可以被收集到 Context 的 disposables 列表中，
   * 实现插件卸载时自动清理所有副作用。
   *
   * @param event - 事件名称
   * @param listener - 监听器函数
   * @param prepend - 是否插入到监听器列表头部（高优先级）
   * @returns dispose 函数，调用后取消监听
   */
  on(event: string, listener: Listener, prepend = false): Dispose {
    // 获取或创建该事件的监听器数组
    let listeners = this._listeners.get(event);
    if (!listeners) {
      listeners = [];
      this._listeners.set(event, listeners);
    }

    // prepend 参数决定监听器的优先级
    // 🎓 Koishi 用 prepend 来实现中间件的前置插入
    if (prepend) {
      listeners.unshift(listener);
    } else {
      listeners.push(listener);
    }

    // 返回 dispose 函数——这是 Koishi 最精妙的设计之一
    return () => {
      this.off(event, listener);
    };
  }

  /**
   * 注册一次性事件监听器
   *
   * 🎓 once 的实现很巧妙：包装原始监听器，在第一次触发后自动取消
   *
   * @param event - 事件名称
   * @param listener - 监听器函数
   * @returns dispose 函数
   */
  once(event: string, listener: Listener): Dispose {
    // 包装成一个自动取消的监听器
    const wrappedListener: Listener = (...args: any[]) => {
      // 先取消注册，再执行——确保回调中触发同一事件不会无限递归
      dispose();
      return listener(...args);
    };
    const dispose = this.on(event, wrappedListener);
    return dispose;
  }

  /**
   * 移除事件监听器
   *
   * @param event - 事件名称
   * @param listener - 要移除的监听器函数
   */
  off(event: string, listener: Listener): void {
    const listeners = this._listeners.get(event);
    if (!listeners) return;

    // 找到并移除目标监听器
    const index = listeners.indexOf(listener);
    if (index !== -1) {
      listeners.splice(index, 1);
    }

    // 如果该事件没有监听器了，清理 Map 条目以释放内存
    if (listeners.length === 0) {
      this._listeners.delete(event);
    }
  }

  /**
   * 触发事件（广播模式）
   *
   * 🎓 emit 是最基本的触发方式：
   * - 依次执行所有监听器
   * - 不关心返回值
   * - 不会被中断
   * 适用于纯通知型事件，如 "ready"、"dispose"
   *
   * @param event - 事件名称
   * @param args - 传递给监听器的参数
   */
  emit(event: string, ...args: any[]): void {
    const listeners = this._listeners.get(event);
    if (!listeners) return;

    // 🎓 注意：这里用展开运算符复制一份数组
    // 避免在遍历过程中监听器列表被修改（比如监听器内部调用了 off）
    for (const listener of [...listeners]) {
      listener(...args);
    }
  }

  /**
   * 触发事件（短路模式）
   *
   * 🎓 bail 是 Koishi 独有的重要语义：
   * - 依次执行监听器
   * - 一旦某个监听器返回了非 undefined 的值，立即停止并返回该值
   * - 如果所有监听器都没有返回值，则返回 undefined
   *
   * 这在 "before-xxx" 类事件中非常有用，比如：
   * - before-send：拦截消息发送
   * - before-command：拦截指令执行
   * 监听器返回值表示"我已经处理了，后面的不用管了"
   *
   * @param event - 事件名称
   * @param args - 传递给监听器的参数
   * @returns 第一个非 undefined 的返回值，或 undefined
   */
  bail(event: string, ...args: any[]): any {
    const listeners = this._listeners.get(event);
    if (!listeners) return undefined;

    for (const listener of [...listeners]) {
      const result = listener(...args);
      // 🎓 短路：一旦有返回值就停止
      if (result !== undefined) {
        return result;
      }
    }
    return undefined;
  }

  /**
   * 并行触发事件
   *
   * 🎓 parallel 语义：
   * - 所有监听器同时启动执行（使用 Promise.all）
   * - 等待所有监听器完成
   * - 适用于不需要顺序执行的异步操作
   *
   * 在 Koishi 中，一些生命周期事件（如 ready）使用 parallel 触发，
   * 让所有插件的初始化可以并行进行，提高启动速度。
   *
   * @param event - 事件名称
   * @param args - 传递给监听器的参数
   */
  async parallel(event: string, ...args: any[]): Promise<void> {
    const listeners = this._listeners.get(event);
    if (!listeners) return;

    // 🎓 使用 Promise.all 并行执行所有监听器
    await Promise.all(
      [...listeners].map((listener) => listener(...args))
    );
  }

  /**
   * 获取指定事件的监听器列表（只读副本）
   *
   * @param event - 事件名称
   * @returns 监听器数组的副本
   */
  listeners(event: string): Listener[] {
    return [...(this._listeners.get(event) || [])];
  }
}
