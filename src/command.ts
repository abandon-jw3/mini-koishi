/**
 * Mini-Koishi 指令系统 (Command)
 *
 * 🎓 学习要点：
 * Koishi 的指令系统是一个小型 DSL（领域特定语言）引擎：
 * 1. 支持定义指令名、描述、参数和选项
 * 2. 自动解析用户输入，匹配对应指令
 * 3. 提取参数和选项，传递给 action 处理函数
 *
 * 指令定义语法：
 *   ctx.command('echo <message>', '回声指令')  // <message> 是必选参数
 *   ctx.command('greet [name]', '打招呼')       // [name] 是可选参数
 *
 * 链式调用：
 *   ctx.command('test', '测试')
 *     .option('verbose', '-v 详细输出')
 *     .action((opts, ...args) => { ... })
 */

import { Session } from './session.js';

// ============================================================================
// 类型定义
// ============================================================================

/** 指令参数定义 */
interface CommandArg {
  /** 参数名称 */
  name: string;
  /** 是否为必选参数 */
  required: boolean;
}

/** 指令选项定义 */
interface CommandOption {
  /** 选项名称（长名，如 'verbose'）*/
  name: string;
  /** 选项短名（如 'v'）*/
  short?: string;
  /** 选项描述 */
  description: string;
}

/** 解析后的指令参数 */
export interface ParsedArgs {
  /** 位置参数列表 */
  args: string[];
  /** 选项键值对 */
  options: Record<string, string | boolean>;
}

/**
 * 指令处理函数
 *
 * 🎓 action 回调接收的参数：
 * - opts: 解析后的选项（如 { verbose: true }）
 * - args: 位置参数列表
 * - session: 当前会话（用于获取上下文信息和发送回复）
 *
 * 返回值为 string 时，会自动作为回复发送
 */
export type CommandAction = (
  opts: Record<string, string | boolean>,
  args: string[],
  session: Session
) => string | void | Promise<string | void>;

// ============================================================================
// Command 类
// ============================================================================

export class Command {
  /** 指令名称（不含参数部分） */
  name: string;

  /** 指令描述 */
  description: string;

  /** 参数定义列表 */
  private _args: CommandArg[] = [];

  /** 选项定义列表 */
  private _options: CommandOption[] = [];

  /** 处理函数 */
  private _action?: CommandAction;

  /**
   * 构造指令
   *
   * 🎓 指令定义字符串的解析过程：
   *   'echo <message>'  → name='echo', args=[{name:'message', required:true}]
   *   'greet [name]'    → name='greet', args=[{name:'name', required:false}]
   *
   * @param def - 指令定义字符串（如 'echo <message>'）
   * @param description - 指令描述
   */
  constructor(def: string, description: string) {
    this.description = description;

    // 🎓 解析指令定义字符串
    const parts = def.split(/\s+/);
    // 第一部分是指令名称
    this.name = parts[0]!;

    // 后续部分是参数定义
    for (let i = 1; i < parts.length; i++) {
      const part = parts[i]!;
      if (part.startsWith('<') && part.endsWith('>')) {
        // 必选参数：<argName>
        this._args.push({
          name: part.slice(1, -1),
          required: true,
        });
      } else if (part.startsWith('[') && part.endsWith(']')) {
        // 可选参数：[argName]
        this._args.push({
          name: part.slice(1, -1),
          required: false,
        });
      }
    }
  }

  /**
   * 添加选项（链式调用）
   *
   * 🎓 选项描述字符串格式：'-v 详细输出'
   *   - 以 '-' 开头的部分是短名
   *   - 剩余部分是描述
   *
   * @param name - 选项长名（如 'verbose'）
   * @param desc - 选项描述（如 '-v 详细输出'）
   * @returns this（支持链式调用）
   */
  option(name: string, desc: string): this {
    // 解析短名和描述
    let short: string | undefined;
    let description = desc;

    // 匹配 '-x' 形式的短名
    const shortMatch = desc.match(/^-(\w)\s*/);
    if (shortMatch) {
      short = shortMatch[1];
      description = desc.slice(shortMatch[0].length);
    }

    this._options.push({ name, short, description });
    return this;
  }

  /**
   * 设置指令处理函数（链式调用）
   *
   * 🎓 action 是指令的核心处理逻辑。
   * 当用户输入匹配此指令时，框架会：
   * 1. 解析参数和选项
   * 2. 调用 action 函数
   * 3. 如果返回字符串，自动发送为回复
   *
   * @param callback - 处理函数
   * @returns this（支持链式调用）
   */
  action(callback: CommandAction): this {
    this._action = callback;
    return this;
  }

  /**
   * 执行指令
   *
   * 🎓 指令执行流程：
   * 1. 解析用户输入的参数和选项
   * 2. 调用 action 处理函数
   * 3. 如果 action 返回字符串，通过 session.send() 发送回复
   *
   * @param args - 用户输入中指令名后面的所有 token
   * @param session - 当前会话
   */
  async execute(args: string[], session: Session): Promise<void> {
    if (!this._action) return;

    // 🎓 解析参数和选项
    const parsed = this._parseArgs(args);

    // 调用 action 并处理返回值
    const result = await this._action(parsed.options, parsed.args, session);

    // 如果返回了字符串，自动发送为回复
    if (typeof result === 'string') {
      await session.send(result);
    }
  }

  /**
   * 解析参数列表
   *
   * 🎓 解析规则：
   * - 以 '--name' 或 '-n' 开头的是选项
   * - '--name=value' 或 '--name value' 设置选项值
   * - '-n' 形式的选项（布尔值，设为 true）
   * - 其余的按顺序作为位置参数
   *
   * @param tokens - 原始 token 列表
   * @returns 解析后的参数对象
   */
  private _parseArgs(tokens: string[]): ParsedArgs {
    const args: string[] = [];
    const options: Record<string, string | boolean> = {};

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]!;

      if (token.startsWith('--')) {
        // 长选项：--name 或 --name=value
        const equalIndex = token.indexOf('=');
        if (equalIndex !== -1) {
          // --name=value 形式
          const name = token.slice(2, equalIndex);
          const value = token.slice(equalIndex + 1);
          options[name] = value;
        } else {
          // --name 形式（后面可能跟值）
          const name = token.slice(2);
          const nextToken = tokens[i + 1];
          if (nextToken && !nextToken.startsWith('-')) {
            options[name] = nextToken;
            i++; // 跳过值
          } else {
            options[name] = true;
          }
        }
      } else if (token.startsWith('-') && token.length === 2) {
        // 短选项：-v
        const shortName = token[1]!;
        // 查找对应的长名
        const opt = this._options.find((o) => o.short === shortName);
        const name = opt ? opt.name : shortName;
        options[name] = true;
      } else {
        // 位置参数
        args.push(token);
      }
    }

    return { args, options };
  }

  /**
   * 获取指令的帮助信息
   *
   * @returns 格式化的帮助文本
   */
  getHelp(): string {
    let help = `  ${this.name}`;

    // 添加参数信息
    for (const arg of this._args) {
      if (arg.required) {
        help += ` <${arg.name}>`;
      } else {
        help += ` [${arg.name}]`;
      }
    }

    help += `  —  ${this.description}`;

    // 添加选项信息
    if (this._options.length > 0) {
      help += '\n    选项：';
      for (const opt of this._options) {
        const shortPart = opt.short ? `-${opt.short}, ` : '    ';
        help += `\n      ${shortPart}--${opt.name}  ${opt.description}`;
      }
    }

    return help;
  }
}

// ============================================================================
// CommandManager 类
// ============================================================================

/**
 * 指令管理器
 *
 * 🎓 CommandManager 负责：
 * 1. 存储所有已注册的指令
 * 2. 根据用户输入匹配对应指令
 * 3. 提供 help 功能列出所有指令
 */
export class CommandManager {
  /** 已注册指令列表 */
  private _commands: Map<string, Command> = new Map();

  /**
   * 注册一个新指令
   *
   * @param def - 指令定义字符串
   * @param description - 指令描述
   * @returns 新创建的 Command 实例（用于链式调用 .option().action()）
   */
  register(def: string, description: string): Command {
    const command = new Command(def, description);
    this._commands.set(command.name, command);
    return command;
  }

  /**
   * 移除一个指令
   *
   * @param name - 指令名称
   */
  remove(name: string): void {
    this._commands.delete(name);
  }

  /**
   * 根据指令名查找指令
   *
   * @param name - 指令名称
   * @returns Command 实例，未找到返回 undefined
   */
  find(name: string): Command | undefined {
    return this._commands.get(name);
  }

  /**
   * 尝试从用户输入中匹配并执行指令
   *
   * 🎓 指令匹配流程：
   * 1. 将用户输入按空格分割成 tokens
   * 2. 第一个 token 作为指令名
   * 3. 在已注册指令中查找匹配项
   * 4. 如果找到，执行指令
   *
   * @param content - 用户输入的原始文本
   * @param session - 当前会话
   * @returns 是否成功匹配到指令
   */
  async execute(content: string, session: Session): Promise<boolean> {
    const tokens = content.trim().split(/\s+/);
    const name = tokens[0];
    if (!name) return false;

    const command = this._commands.get(name);
    if (!command) return false;

    // 🎓 将指令名后面的所有 token 传给指令执行
    await command.execute(tokens.slice(1), session);
    return true;
  }

  /**
   * 获取所有指令的帮助信息
   *
   * @returns 格式化的帮助文本
   */
  getHelp(): string {
    if (this._commands.size === 0) {
      return '暂无已注册指令';
    }

    let help = '📖 可用指令列表：\n';
    for (const command of this._commands.values()) {
      help += command.getHelp() + '\n';
    }
    return help;
  }

  /**
   * 获取所有指令名列表
   */
  getCommandNames(): string[] {
    return [...this._commands.keys()];
  }
}
