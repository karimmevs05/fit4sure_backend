// Professionally retouches a real uploaded plate photo before it goes into
// a carousel/story render -- raw camera photos (uneven kitchen lighting,
// flat color) don't look like ready-to-post content on their own. Uses
// Gemini's image model (the same GOOGLE_GEMINI_API_KEY already wired up
// elsewhere) as an actual photo editor: same plate, same framing, same
// food -- just lit, color-graded, and sharpened the way a skilled editor
// would before publishing.

const { GoogleGenerativeAI } = require('@google/generative-ai')

function getGeminiClient() {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY
  if (!apiKey) throw new Error('GOOGLE_GEMINI_API_KEY not configured in .env')
  return new GoogleGenerativeAI(apiKey)
}

const EDIT_PROMPT = `Professionally retouch this real food photo for an Instagram post: correct white balance, boost appetizing warmth and contrast, sharpen detail, clean even lighting, remove harsh shadows. Keep it 100% realistic -- do not add, remove, or change any food items, do not restyle the plate or container. Same framing and composition.`

async function editFoodPhoto(buffer, mimeType) {
  const genAI = getGeminiClient()
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-image' })
  const result = await model.generateContent([
    { inlineData: { data: buffer.toString('base64'), mimeType } },
    EDIT_PROMPT,
  ])
  const parts = result.response.candidates?.[0]?.content?.parts || []
  const imgPart = parts.find((p) => p.inlineData)
  if (!imgPart) throw new Error('Photo edit did not return an image')
  return { buffer: Buffer.from(imgPart.inlineData.data, 'base64'), mimeType: imgPart.inlineData.mimeType }
}

module.exports = { editFoodPhoto }
