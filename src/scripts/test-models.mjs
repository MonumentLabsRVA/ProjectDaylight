import 'dotenv/config'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const MODELS = ['gpt-5.5', 'gpt-5.4-mini', 'gpt-5.4-nano']

for (const model of MODELS) {
  process.stdout.write(`${model.padEnd(16)} ... `)
  try {
    const t0 = Date.now()
    const res = await openai.responses.create({
      model,
      instructions: 'Reply with exactly one word.',
      input: 'Say "ok".',
      reasoning: { effort: 'low' }
    })
    const ms = Date.now() - t0
    console.log(`OK (${ms}ms) → ${JSON.stringify(res.output_text?.trim() ?? '')}`)
  } catch (err) {
    console.log(`FAIL → ${err?.status ?? ''} ${err?.message ?? err}`)
    process.exitCode = 1
  }
}
