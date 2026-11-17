import { minimaxAsrBaseUrls, minimaxBaseUrl, type AppSettings } from '../shared/types'

const SYSTEM_PROMPT = `你是面试答题助手。根据面试官口述转写出来的问题，给出候选人可以当场扫读或口述的中文答案。

要求：
1. 先用一句话直接回答核心观点。
2. 再用 3～6 条要点展开；行为/项目题优先用 STAR（背景、任务、行动、结果），结果尽量带数字。
3. 语言自然、简洁，像口语，不要空话、不要自我介绍你是 AI。
4. 如果转写含糊，先写出你理解的问题，再作答。
5. 不要输出思考过程，直接给答案。`

function stripThinking(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*$/gi, '')
    .trim()
}

function joinBase(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, '')}${path}`
}

async function readErrorMessage(response: Response): Promise<string> {
  const raw = await response.text()
  try {
    const json = JSON.parse(raw) as {
      error?: { message?: string }
      base_resp?: { status_msg?: string }
      message?: string
    }
    return (
      json.error?.message ||
      json.base_resp?.status_msg ||
      json.message ||
      raw ||
      `HTTP ${response.status}`
    )
  } catch {
    return raw || `HTTP ${response.status}`
  }
}

type TranscribeParams = {
  settings: AppSettings
  audio: Buffer
  filename: string
  mimeType: string
  signal?: AbortSignal
}

function audioBlob(params: TranscribeParams): Blob {
  return new Blob([new Uint8Array(params.audio)], { type: params.mimeType })
}

/**
 * 转写入口：默认走 MiniMax 官方语音识别（asr-1.0），同一个 API Key 即可。
 * 若用户在设置里填了自定义地址，则改用 Whisper 兼容接口覆盖。
 */
export async function transcribeAudio(params: TranscribeParams): Promise<string> {
  const { settings } = params
  if (!settings.apiKey.trim()) {
    throw new Error('请先在设置中填写 API Key')
  }
  const customBase = settings.sttBaseUrl.trim()
  return customBase
    ? transcribeWithWhisper(customBase, params)
    : transcribeWithMinimax(params)
}

/** 用户自建 / 第三方 Whisper 兼容服务：POST {base}/audio/transcriptions */
async function transcribeWithWhisper(base: string, params: TranscribeParams): Promise<string> {
  const { settings, filename, signal } = params
  const form = new FormData()
  form.append('file', audioBlob(params), filename)
  form.append('model', settings.sttModel.trim() || 'whisper-1')
  form.append('language', 'zh')

  const response = await fetch(joinBase(base, '/audio/transcriptions'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${settings.apiKey.trim()}`
    },
    body: form,
    signal
  })

  if (!response.ok) {
    throw new Error(`自定义转写失败：${await readErrorMessage(response)}`)
  }

  const json = (await response.json()) as { text?: string }
  const text = json.text?.trim()
  if (!text) throw new Error('自定义转写没有返回文本')
  return text
}

/** MiniMax 官方语音识别：POST /v1/speech_to_text，multipart/form-data，model=asr-1.0。 */
async function transcribeWithMinimax(params: TranscribeParams): Promise<string> {
  const { settings, filename, signal } = params
  const apiKey = settings.apiKey.trim()
  let lastError = ''

  for (const base of minimaxAsrBaseUrls(settings.region)) {
    const form = new FormData()
    form.append('model', 'asr-1.0')
    form.append('file', audioBlob(params), filename)
    form.append('response_format', 'json')
    form.append('stream', 'false')

    let response: Response
    try {
      response = await fetch(joinBase(base, '/speech_to_text'), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          language: 'zh'
        },
        body: form,
        signal
      })
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') throw err
      lastError = err instanceof Error ? err.message : '网络请求失败'
      continue
    }

    if (response.ok) {
      const json = (await response.json()) as { text?: string }
      const text = json.text?.trim()
      if (text) return text
      // HTTP 200 但 text 为空：接口正常，通常是这段音频里没有可识别的人声。
      lastError = '这段音频里没有识别出文字，请确认录到的是清晰的人声提问，而不是静音或音乐'
      continue
    }

    const message = await readErrorMessage(response)
    // 域名或鉴权体系不匹配时试下一个候选；欠费、限流、参数错误直接反馈给用户。
    if ([401, 403, 404].includes(response.status)) {
      lastError = message
      continue
    }
    throw new Error(`MiniMax 语音识别失败：${message}`)
  }

  throw new Error(`MiniMax 语音识别失败：${lastError || '未知错误'}`)
}

export async function streamAnswer(params: {
  settings: AppSettings
  question: string
  onDelta: (fullText: string) => void
  signal?: AbortSignal
}): Promise<string> {
  const { settings, question, onDelta, signal } = params
  if (!settings.apiKey.trim()) {
    throw new Error('请先在设置中填写 MiniMax API Key')
  }

  const response = await fetch(joinBase(minimaxBaseUrl(settings.region), '/chat/completions'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${settings.apiKey.trim()}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: settings.model,
      stream: true,
      temperature: 0.7,
      max_completion_tokens: 2048,
      thinking: { type: 'disabled' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `面试官问题：\n${question}` }
      ]
    }),
    signal
  })

  if (!response.ok) {
    throw new Error(`MiniMax 调用失败：${await readErrorMessage(response)}`)
  }

  if (!response.body) {
    throw new Error('MiniMax 没有返回流式内容')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let raw = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const data = trimmed.slice(5).trim()
      if (!data || data === '[DONE]') continue
      try {
        const json = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string } }>
        }
        const piece = json.choices?.[0]?.delta?.content
        if (piece) {
          raw += piece
          onDelta(stripThinking(raw))
        }
      } catch {
        // ignore malformed SSE chunks
      }
    }
  }

  const finalText = stripThinking(raw)
  if (!finalText) throw new Error('MiniMax 没有生成答案')
  onDelta(finalText)
  return finalText
}
