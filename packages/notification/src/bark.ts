import { ofetch } from 'ofetch'

export async function bark(url: string, title: string, content: string) {
  if (typeof url !== 'string' || !url.startsWith('https://')) {
    console.error('Wrong type for Bark URL.')
    return -1
  }

  const payload = {
    title,
    body: content,
    group: 'Skland',
  }
  try {
    const data = await ofetch(
      url,
      {
        method: 'POST',
        body: payload,
      },
    )
    console.debug(data)
  }
  catch (error) {
    console.error(`[Bark] Error: ${error}`)
    return -1
  }
}
