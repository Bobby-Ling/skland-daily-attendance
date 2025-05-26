import type { BindingUserItem } from '@skland-x/core'
import type { Storage } from 'unstorage'
import { attendance, auth, getBinding, signIn } from '@skland-x/core'
import { createStorage } from 'unstorage'
import cloudflareKVBindingDriver from 'unstorage/drivers/cloudflare-kv-binding'

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

function formatCharacterName(character: BindingUserItem) {
  return `${formatChannelName(character.channelMasterId)}角色${formatPrivacyName(character.nickName)}`
}

function formatChannelName(channelMasterId: string) {
  return (Number(channelMasterId) - 1) ? 'B 服' : '官服'
}

function formatPrivacyName(nickName: string) {
  const [name, number] = nickName.split('#')
  if (name.length <= 2)
    return nickName

  const firstChar = name[0]
  const lastChar = name[name.length - 1]
  const stars = '*'.repeat(name.length - 2)

  return `${firstChar}${stars}${lastChar}#${number}`
}

async function cleanOutdatedData(storage: Storage<true>) {
  const allKeys = await storage.getKeys()

  const keysWithDate = allKeys.map((key) => {
    const [date] = key.split(':')

    return { date: new Date(date), key }
  })

  const keysToRemove = keysWithDate.filter(({ date }) => {
    const sevenDaysAgo = new Date(new Date().toISOString().split('T')[0])
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    return date < sevenDaysAgo
  })

  await Promise.all(keysToRemove.map(i => storage.removeItem(i.key)))
}

export default {
  fetch() {
    return new Response(`Running in ${navigator.userAgent}!`)
  },
  async scheduled(_event, env, _ctx): Promise<void> {
    if (!env.SKLAND_TOKEN) {
      throw new Error('SKLAND_TOKEN 未设置')
    }
    const date = new Date().toISOString().split('T')[0]
    const storage = createStorage<true>({
      driver: cloudflareKVBindingDriver({ binding: env.SKLAND_DAILY_ATTENDANCE_STORAGE }),
    })

    const tokens = env.SKLAND_TOKEN.split(',')

    console.log(`共需要签到 ${tokens.length} 个账号`)

    let doneAccount = 0
    for (const token of tokens) {
      console.log(`开始签到 ${doneAccount + 1} 个账号`)

      const { code } = await auth(token)
      const { cred, token: signToken } = await signIn(code)
      const { list } = await getBinding(cred, signToken)

      const characterList = list.filter(i => i.appCode === 'arknights').map(i => i.bindingList).flat()

      let successAttendance = 0

      for (const character of characterList) {
        console.log(`将签到第 ${successAttendance + 1} 个角色`)

        const key = `${date}:${character.uid}`
        const isAttended = await storage.getItem(key)
        if (isAttended) {
          console.log(`${formatCharacterName(character)}今天已经签到过了`)
          continue
        }

        try {
          const data = await attendance(cred, signToken, {
            uid: character.uid,
            gameId: character.channelMasterId,
          })
          if (data) {
            if (data.code === 0 && data.message === 'OK') {
              const msg = `${formatCharacterName(character)}签到成功${`, 获得了${data.data.awards.map(a => `「${a.resource.name}」${a.count}个`).join(',')}`}`
              console.log(msg)
              successAttendance++
              await storage.setItem(key, true)
            }
            else {
              const msg = `${formatCharacterName(character)}签到失败${`, 错误消息: ${data.message}\n\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``}`
              console.error(msg)
            }
          }
          else {
            console.log(`${formatCharacterName(character)}今天已经签到过了`)
            await storage.setItem(key, true)
          }
        }
        catch (error: any) {
          if (error.response && error.response.status === 403) {
            console.log(`${formatCharacterName(character)}今天已经签到过了`)
            await storage.setItem(key, true)
          }
          else {
            console.error(`签到过程中出现未知错误: ${error.message}`)
            console.error('发生未知错误，工作流终止。')
          }
        }

        // 多个角色之间的延时
        await new Promise(resolve => setTimeout(resolve, 3000))
      }

      doneAccount++
    }

    await cleanOutdatedData(storage)
  },
} satisfies ExportedHandler<Env>
