// Subject-aware crop for uploaded plate photos: raw shots vary wildly in
// how much counter/background surrounds the container, so a fixed-percentage
// center crop either leaves the food small in a wide shot or cuts into it in
// a tight one. Instead: ask Gemini to locate the food container + the
// countertop it's sitting on (the real subject), confirm the branded tag is
// inside that box, then crop tight to it in pixel space with sharp before
// resizing to the render's exact target aspect ratio. No rotation is ever
// applied -- photos render level.

const sharp = require('sharp')
const { GoogleGenerativeAI } = require('@google/generative-ai')

function getGeminiClient() {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY
  if (!apiKey) throw new Error('GOOGLE_GEMINI_API_KEY not configured in .env')
  return new GoogleGenerativeAI(apiKey)
}

// Coordinates are on a 0-1000 normalized grid over the full image (x/y is
// the top-left corner) -- this is the same convention Gemini's own object
// detection prompting guides recommend, and keeps the model's answer
// independent of the source photo's real pixel dimensions.
async function detectSubjectBox(buffer, mimeType) {
  const genAI = getGeminiClient()
  const model = genAI.getGenerativeModel({ model: 'gemini-flash-latest' })
  const result = await model.generateContent([
    { inlineData: { data: buffer.toString('base64'), mimeType } },
    `Look at this photo of a meal-prep food container photographed on a countertop. Respond with ONLY a JSON object, no markdown fences: {"box": {"x": 0, "y": 0, "width": 0, "height": 0}, "tag_visible": true}.

"box" is a bounding box on a 0-1000 normalized grid over the full image (x,y = top-left corner, width/height in the same units) tightly containing BOTH the food container/plate AND the countertop surface directly under and immediately around it. Exclude background walls, other counters, or unrelated clutter beyond that immediate surface. If a small orange branded tag/label is visible under or beside the container, it must be fully inside the box -- treat it as a required element, not optional background.

"tag_visible" is true only if that branded orange tag/label is visible anywhere in the original photo (whether or not it ended up inside your box).`,
  ])
  const text = result.response.text()
  const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/)
  return JSON.parse(jsonMatch ? jsonMatch[1] : text)
}

// Crops to the detected subject box (with a small margin) then resizes to
// exactly fill targetWidth x targetHeight -- the fit is decided here, once,
// rather than left to CSS object-fit downstream, so what we detected as the
// subject is really what ends up on screen instead of being re-cropped.
async function cropToSubject(buffer, mimeType, targetWidth, targetHeight) {
  const [detection, metadata] = await Promise.all([
    detectSubjectBox(buffer, mimeType),
    sharp(buffer).metadata(),
  ])

  const imgW = metadata.width
  const imgH = metadata.height
  const box = detection.box || { x: 0, y: 0, width: 1000, height: 1000 }

  const marginRatio = 0.05
  const rawLeft = (box.x / 1000) * imgW
  const rawTop = (box.y / 1000) * imgH
  const rawWidth = (box.width / 1000) * imgW
  const rawHeight = (box.height / 1000) * imgH

  const marginX = rawWidth * marginRatio
  const marginY = rawHeight * marginRatio

  const left = Math.max(0, Math.round(rawLeft - marginX))
  const top = Math.max(0, Math.round(rawTop - marginY))
  const right = Math.min(imgW, Math.round(rawLeft + rawWidth + marginX))
  const bottom = Math.min(imgH, Math.round(rawTop + rawHeight + marginY))
  const width = Math.max(1, right - left)
  const height = Math.max(1, bottom - top)

  const cropped = await sharp(buffer)
    .extract({ left, top, width, height })
    .resize({ width: targetWidth, height: targetHeight, fit: 'cover' })
    .jpeg({ quality: 90 })
    .toBuffer()

  return { buffer: cropped, tagVisible: !!detection.tag_visible }
}

module.exports = { cropToSubject }
