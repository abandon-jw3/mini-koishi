/**
 * Mini-Koishi 会话模型 (Session)
 *
 * 🎓 学习要点：
 * Session 是 Koishi 中消息流转的载体，封装了"一次对话交互"的所有信息。
 * 当用户在任何平台发送消息时，适配器会创建一个 Session 对象，
 * 然后这个 Session 会依次经过：
 *   事件触发 → 中间件链 → 指令匹配 → 指令执行
 *
 * Session 包含：
 * - 消息来源信息（平台、用户、频道等）
 * - 消息内容
 * - 回复方法（send）
 */

// ============================================================================
// 类型定义
// ============================================================================

/** 发送消息的回调函数类型 */
export type SendCallback = (content: string) => void | Promise<void>;

// ============================================================================
// Session 类
// ============================================================================

export class Session {
  /** 消息所在的平台标识（如 'cli', 'qq', 'discord'）*/
  platform: string;

  /** 用户ID */
  userId: string;

  /** 用户昵称 */
  username: string;

  /** 频道/群组 ID（私聊时为空字符串） */
  channelId: string;

  /** 消息内容（原始文本） */
  content: string;

  /** 消息类型（如 'text', 'image' 等） */
  type: string;

  /** 消息时间戳 */
  timestamp: number;

  /**
   * 发送回复的回调函数
   *
   * 🎓 这里用回调函数而非直接引用适配器，是为了解耦：
   * Session 不需要知道适配器的具体实现，
   * 只需要知道"怎么发送回复"就够了。
   */
  private _send: SendCallback;

  constructor(options: {
    platform: string;
    userId: string;
    username?: string;
    channelId?: string;
    content: string;
    type?: string;
    send: SendCallback;
  }) {
    this.platform = options.platform;
    this.userId = options.userId;
    this.username = options.username || options.userId;
    this.channelId = options.channelId || "";
    this.content = options.content;
    this.type = options.type || "text";
    this.timestamp = Date.now();
    this._send = options.send;
  }

  /**
   * 发送回复消息
   *
   * 🎓 Session.send() 是插件与用户交互的主要方式。
   * 在 Koishi 中，这个方法最终会调用适配器的 sendMessage，
   * 将消息发送回对应的平台。
   *
   * @param content - 要发送的消息内容
   */
  async send(content: string): Promise<void> {
    await this._send(content);
  }
}
