import { attendance, auth, getBinding, signIn } from '@skland-x/core'

/**
 * Welcome to Cloudflare Workers!
 *
 * This is a template for a Scheduled Worker: a Worker that can run on a
 * configurable interval:
 * https://developers.cloudflare.com/workers/platform/triggers/cron-triggers/
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Run `curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"` to see your Worker in action
 * - Run `npm run deploy` to publish your Worker
 *
 * Bind resources to your Worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

export default {
  fetch() {
    return new Response(`Running in ${navigator.userAgent}!`)
  },
  async scheduled(_event, env, _ctx): Promise<void> {
    if (!env.SKLAND_TOKEN) {
      throw new Error('SKLAND_TOKEN 未设置')
    }

    const { code } = await auth(env.SKLAND_TOKEN)
    const { cred, token: signToken } = await signIn(code)
    const { list } = await getBinding(cred, signToken)

    const characterList = list.filter(i => i.appCode === 'arknights').map(i => i.bindingList).flat()

    const maxRetries = 3
    let successAttendance = 0
    await Promise.all(characterList.map(async (character) => {
      console.log(`将签到第${successAttendance + 1}个角色`)

      let retries = 0 // 初始化重试计数器
      while (retries < maxRetries) {
        try {
          const data = await attendance(cred, signToken, {
            uid: character.uid,
            gameId: character.channelMasterId,
          })
          if (data) {
            if (data.code === 0 && data.message === 'OK') {
              const msg = `${(Number(character.channelMasterId) - 1) ? 'B 服' : '官服'}角色 ${successAttendance + 1} 签到成功${`, 获得了${data.data.awards.map(a => `「${a.resource.name}」${a.count}个`).join(',')}`}`
              console.log(msg)
              successAttendance++
              break // 签到成功，跳出重试循环
            }
            else {
              const msg = `${(Number(character.channelMasterId) - 1) ? 'B 服' : '官服'}角色 ${successAttendance + 1} 签到失败${`, 错误消息: ${data.message}\n\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``}`
              console.error(msg)
              retries++ // 签到失败，增加重试计数器
            }
          }
          else {
            console.log(`${(Number(character.channelMasterId) - 1) ? 'B 服' : '官服'}角色 ${successAttendance + 1} 今天已经签到过了`)
            break // 已经签到过，跳出重试循环
          }
        }
        catch (error: any) {
          if (error.response && error.response.status === 403) {
            console.log(`${(Number(character.channelMasterId) - 1) ? 'B 服' : '官服'}角色 ${successAttendance + 1} 今天已经签到过了`)
            break // 已经签到过，跳出重试循环
          }
          else {
            console.error(`签到过程中出现未知错误: ${error.message}`)
            console.error('发生未知错误，工作流终止。')
            retries++ // 增加重试计数器
            if (retries >= maxRetries) {
              return
            }
          }
        }
        // 多个角色之间的延时
        await new Promise(resolve => setTimeout(resolve, 3000))
      }
    }))
  },
} satisfies ExportedHandler<Env>
