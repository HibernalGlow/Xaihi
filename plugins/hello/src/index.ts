/**
 * `@hibernalglow/xaihi-hello` 的宿主半边。
 *
 * 存在的目的是证明两件事：插件自带的一行能被 loader 装载，以及它的工具真的能被
 * 模型调用。因此只注册一个工具，配置项在使用点 `.get()` 读，保证改配置不重启即可见。
 *
 * @module xaihi-hello
 */

import type { Context, Volatile } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = '@hibernalglow/xaihi-hello'

export const inject = ['tools']

export interface Config {
  /** 工具返回值与面板标题前缀用的标签。 */
  label: Volatile<string>
}

export const Config = Schema.object({
  label: Schema.string().default('hello').volatile(),
})

export function apply(ctx: Context, config: Config): void {
  ctx.tools.register(defineTool({
    name: 'xaihi_hello_ping',
    description: 'Echo a message through the Xaihi example node, proving the node backend is mounted.',
    parameters: {
      message: { type: 'string', description: 'Text to echo back' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    presentResult: (_args, result) => ({
      card: 'generic',
      title: 'xaihi_hello_ping',
      content: [{
        type: 'text',
        text: result.content.map((block) => block.type === 'text' ? block.text : '').join(''),
      }],
    }),
    async execute(args) {
      return `${config.label.get()}: ${args.message ?? 'pong'}`
    },
  }))
}
