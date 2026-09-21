// Retouches a real uploaded plate photo before it goes into a
// carousel/story render -- raw camera photos (uneven kitchen lighting,
// flat color) don't look like ready-to-post content on their own.
//
// This used to call Gemini's image model to "retouch" the photo, but that
// was unreliable in practice: compared side by side against the raw photo,
// the AI edit was often barely distinguishable -- sometimes it made a real
// change, sometimes almost none, with no way to control or guarantee the
// result. A deterministic pipeline (sharp: auto white-balance/contrast
// stretch, saturation/contrast boost, sharpening) is controllable and
// applies the same real improvement every time, with no extra API latency
// or cost per render.

const sharp = require('sharp')

async function editFoodPhoto(buffer, mimeType) {
  const edited = await sharp(buffer)
    .rotate() // respect EXIF orientation before any processing
    .normalize() // stretches the histogram -- fixes flat/washed-out lighting
    .modulate({ saturation: 1.22, brightness: 1.05 })
    .linear(1.1, -10) // slight contrast boost
    .sharpen({ sigma: 1.1 })
    .jpeg({ quality: 92 })
    .toBuffer()
  return { buffer: edited, mimeType: 'image/jpeg' }
}

module.exports = { editFoodPhoto }
