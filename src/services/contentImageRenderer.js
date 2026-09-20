// Renders Instagram-ready carousel/story cards for the Marketing page --
// HTML/CSS-style layout (via satori, the same engine behind Vercel's OG
// image generation) rasterized to PNG (via resvg), no Canva dependency for
// rendering itself. The layout is a deliberate match of Fit4Sure's real
// Canva story template ("Ready in 2 miN (STORY POST MAY)", design
// DAHJAx4BvjY) -- read directly via the Canva API (real hex colors, font
// sizes, element positions, the brand's own rotating taglines, and the
// actual chevron icon asset) so this reproduces the real brand system.
//
// Layout is enforced with fixed safe zones (title / subtitle / photo / bar)
// and real text measurement for autofit -- not eyeballed ratios -- because
// a flexible/content-driven layout let long dish names overflow into a 3rd
// line and collide with the photo underneath. See getLayoutZones and
// autofitTitle below.
//
// satori is ESM-only; this file stays CommonJS (like the rest of the
// backend) and loads it via dynamic import.

const fs = require('fs')
const path = require('path')
const sharp = require('sharp')
const opentype = require('@shuding/opentype.js')
const { Resvg } = require('@resvg/resvg-js')
const { cropToSubject } = require('./subjectCrop')

const FONT_DIR = path.join(__dirname, '../assets/fonts')
const ICON_DIR = path.join(__dirname, '../assets/icons')

const fontCache = {}
function loadFont(filename) {
  if (!fontCache[filename]) fontCache[filename] = fs.readFileSync(path.join(FONT_DIR, filename))
  return fontCache[filename]
}

let satoriPromise = null
async function getSatori() {
  if (!satoriPromise) satoriPromise = import('satori').then((m) => m.default)
  return satoriPromise
}

async function getFonts() {
  return [
    { name: 'Baloo 2', data: loadFont('Baloo2-SemiBold.ttf'), weight: 600, style: 'normal' },
    { name: 'Baloo 2', data: loadFont('Baloo2-ExtraBold.ttf'), weight: 800, style: 'normal' },
    { name: 'Caveat', data: loadFont('Caveat-Bold.ttf'), weight: 700, style: 'normal' },
  ]
}

// ---------------------------------------------------------------------------
// Real text measurement (not eyeballed font-size ratios) -- parses the exact
// TTF satori renders with, so wrap decisions match what actually gets drawn.
// ---------------------------------------------------------------------------
let nameFontParsedCache = null
function getNameOpentypeFont() {
  if (!nameFontParsedCache) {
    const buf = loadFont('Baloo2-ExtraBold.ttf')
    nameFontParsedCache = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
  }
  return nameFontParsedCache
}

function measureTextWidth(font, text, fontSize) {
  const glyphs = font.stringToGlyphs(text)
  let unitsWide = 0
  glyphs.forEach((g) => { unitsWide += g.advanceWidth })
  const rawWidth = (unitsWide / font.unitsPerEm) * fontSize
  // Must account for the CSS letterSpacing actually applied when rendered
  // (NAME_LETTER_SPACING below) -- raw glyph advances alone undercount it,
  // which was silently letting satori re-wrap a line I'd measured as fitting.
  const extraSpacing = NAME_LETTER_SPACING * Math.max(0, text.length - 1)
  return rawWidth + extraSpacing
}

// Real glyph-width measurement is close to but not bit-for-bit identical to
// satori's own text shaping (hinting/rounding differences) -- this margin
// keeps every fit decision conservative so a line I measure as fitting
// never silently re-wraps inside satori. Combined with whiteSpace:'nowrap'
// on each rendered line (buildTree) as a hard backstop.
const WIDTH_SAFETY_MARGIN = 0.95
const NAME_LETTER_SPACING = 0.5

// Greedy word-wrap simulation at a given font size -- mirrors how the text
// block actually wraps at that pixel width.
function wrapText(font, text, fontSize, maxWidth) {
  const safeWidth = maxWidth * WIDTH_SAFETY_MARGIN
  const words = text.split(' ')
  const lines = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (current && measureTextWidth(font, candidate, fontSize) > safeWidth) {
      lines.push(current)
      current = word
    } else {
      current = candidate
    }
  }
  if (current) lines.push(current)
  return lines
}

// Steps the dish-name font size down from a fixed ceiling: start at max
// size, and if it already wraps to at most `maxLines` there, use it as-is
// (a short name naturally landing on 1 line at max size is exactly what we
// want -- there's no reason to shrink it further just to force fewer
// lines, that only leaves an awkward empty gap in the fixed title zone).
// Only shrink when it doesn't fit within `maxLines` yet. The whole title
// block (name lines + the "XXG PROTEIN" line, if present) must also fit
// inside the fixed title safe-zone height. Never allows a 3rd line or
// overflow -- if even the floor size can't satisfy both, returns
// fits:false so the caller can flag the card for manual review instead of
// rendering broken/overflowing text.
function autofitTitle({ name, hasProteinLine, maxFontSize, minFontSize, step, maxWidth, maxLines, lineHeight, maxBlockHeight, proteinGap }) {
  const font = getNameOpentypeFont()
  const blockHeightFor = (lineCount, size) => (lineCount + (hasProteinLine ? 1 : 0)) * size * lineHeight + (hasProteinLine ? proteinGap : 0)

  for (let size = maxFontSize; size >= minFontSize; size -= step) {
    const nameLines = wrapText(font, name, size, maxWidth)
    if (nameLines.length > maxLines) continue
    if (blockHeightFor(nameLines.length, size) <= maxBlockHeight) return { fontSize: size, nameLines, fits: true }
  }
  const nameLines = wrapText(font, name, minFontSize, maxWidth).slice(0, maxLines)
  return { fontSize: minFontSize, nameLines, fits: false }
}

// The max font size ("ceiling") is calibrated, not guessed -- the largest
// size at which the real reference short name ("Protein Waffles") fits on
// one line at this box width, per spec ("match the current 'PROTEIN
// WAFFLES' size as the ceiling"). Cached per maxWidth since it's the same
// for every render at a given canvas width.
const CEILING_ANCHOR_NAME = 'PROTEIN WAFFLES'
const ceilingCache = {}
function getCeilingFontSize(maxWidth) {
  if (ceilingCache[maxWidth]) return ceilingCache[maxWidth]
  const font = getNameOpentypeFont()
  let size = 200
  while (size > 20 && measureTextWidth(font, CEILING_ANCHOR_NAME, size) > maxWidth * WIDTH_SAFETY_MARGIN) size -= 1
  ceilingCache[maxWidth] = size
  return size
}

// ---------------------------------------------------------------------------
// Fixed safe-zone geometry -- title/subtitle/bar get fixed heights so the
// photo zone's position and size never shifts based on how much text there
// is. Exported so the subject-aware photo crop (subjectCrop.js) can target
// the exact same photo-zone pixel box the renderer will place it in.
// ---------------------------------------------------------------------------
function getLayoutZones(width, height) {
  const titleZoneHeight = Math.round(height * 0.28)
  const subtitleZoneHeight = Math.round(height * 0.075)
  const barHeight = Math.round(height * 0.088)
  const barMarginBottom = Math.round(height * 0.022)
  const barZoneHeight = barHeight + barMarginBottom + Math.round(height * 0.014)
  const photoTop = titleZoneHeight + subtitleZoneHeight
  const photoHeight = height - photoTop - barZoneHeight
  return { titleZoneHeight, subtitleZoneHeight, barHeight, barMarginBottom, photoTop, photoHeight, photoWidth: width }
}

// ---------------------------------------------------------------------------
// Real Canva chevron asset ("Gradient arrow to drag", mediaId MAGFZMufjGU)
// pulled directly from the actual template instead of a hand-drawn
// approximation -- recolored to the template's cream text color the same
// way Canva's own recoloring does (#000000 -> #ffe7c2), alpha preserved.
// ---------------------------------------------------------------------------
let chevronDataUriPromise = null
async function getChevronDataUri() {
  if (!chevronDataUriPromise) {
    chevronDataUriPromise = (async () => {
      const raw = fs.readFileSync(path.join(ICON_DIR, 'chevron-drag.png'))
      const { data, info } = await sharp(raw).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 0xff; data[i + 1] = 0xe7; data[i + 2] = 0xc2
      }
      const recolored = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer()
      return `data:image/png;base64,${recolored.toString('base64')}`
    })()
  }
  return chevronDataUriPromise
}

const BG_PALETTE = ['#ce6415', '#0097b2', '#3c745e', '#e8c48c', '#d8a65b', '#457a00', '#ff9a50']

const TAGLINES = [
  'STAY FUELED, STAY FOCUS',
  'BUILT FOR BUSY DAYS',
  'EAT BETTER, FEEL BETTER',
  'HEALTHY MADE EASY',
  'HEALTHY MEALS, NO COMPROMISE',
  'COMFORT FOOD, REDEFINED',
  'HANDLED, WITHOUT WORK',
  'FOOD THAT KEEPS UP WITH YOU',
  'EFFORTLESSLY TASTY',
]

const TEXT_CREAM = '#ffe7c2'

function hashString(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0
  return Math.abs(h)
}

function pick(list, seed) {
  return list[hashString(seed) % list.length]
}

function chevronIcon(chevronDataUri, size) {
  const h = Math.round(size * 0.65)
  return {
    type: 'img',
    props: { src: chevronDataUri, width: size, height: h, style: { transform: 'rotate(-90deg)' } },
  }
}

async function imageToDataUri(buffer) {
  const resized = await sharp(buffer).jpeg({ quality: 90 }).toBuffer()
  return `data:image/jpeg;base64,${resized.toString('base64')}`
}

function buildTree({ width, height, photoDataUri, chevronDataUri, name, proteinG, seed, titleFit }) {
  const bg = pick(BG_PALETTE, seed)
  const tagline = pick(TAGLINES, seed + '-tag')
  const zones = getLayoutZones(width, height)

  const barY = height - zones.barHeight - zones.barMarginBottom
  const barFontSize = Math.round(width * 0.031)
  const chevronSize = Math.round(zones.barHeight * 0.55)

  const hasProteinLine = proteinG != null
  const { fontSize: nameFontSize, nameLines } = titleFit

  return {
    type: 'div',
    props: {
      style: {
        width, height, display: 'flex', flexDirection: 'column', position: 'relative',
        backgroundColor: bg, fontFamily: 'Baloo 2', overflow: 'hidden',
      },
      children: [
        // Diagonal stripe texture -- subtle low-opacity band matching the
        // real template's background texture.
        {
          type: 'div',
          props: {
            style: {
              display: 'flex', position: 'absolute', left: -width * 0.4, top: -height * 0.08,
              width: width * 1.8, height: height * 0.5, opacity: 0.1, transform: 'rotate(24deg)',
              backgroundImage: `repeating-linear-gradient(90deg, #ffffff 0px, #ffffff 26px, transparent 26px, transparent 70px)`,
            },
          },
        },
        // Title zone -- fixed height, never overlapped by the photo below it.
        {
          type: 'div',
          props: {
            style: {
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start',
              width, height: zones.titleZoneHeight, position: 'relative', overflow: 'hidden',
              padding: `${Math.round(height * 0.05)}px ${Math.round(width * 0.06)}px 0`,
              textAlign: 'center',
            },
            children: [
              ...nameLines.map((line, i) => ({
                type: 'div',
                key: `name-${i}`,
                props: {
                  style: {
                    display: 'flex', fontFamily: 'Baloo 2', fontWeight: 800, fontSize: nameFontSize,
                    color: TEXT_CREAM, lineHeight: 1.16, textAlign: 'center', letterSpacing: NAME_LETTER_SPACING,
                    textShadow: '0 8px 20px rgba(0,0,0,0.3)', whiteSpace: 'nowrap',
                  },
                  children: line.toUpperCase(),
                },
              })),
              hasProteinLine && {
                type: 'div',
                props: {
                  style: {
                    display: 'flex', fontFamily: 'Baloo 2', fontWeight: 800, fontSize: nameFontSize,
                    color: TEXT_CREAM, lineHeight: 1.16, textAlign: 'center', marginTop: 4,
                    textShadow: '0 8px 20px rgba(0,0,0,0.3)',
                  },
                  children: `${proteinG}G PROTEIN`,
                },
              },
            ].filter(Boolean),
          },
        },
        // Subtitle zone -- fixed height, directly below the title zone, own
        // dedicated band so it can never be covered by the photo.
        {
          type: 'div',
          props: {
            style: {
              display: 'flex', alignItems: 'center', justifyContent: 'center', width,
              height: zones.subtitleZoneHeight, position: 'relative',
            },
            children: {
              type: 'div',
              props: {
                style: {
                  display: 'flex', fontFamily: 'Caveat', fontWeight: 700, fontSize: Math.round(width * 0.058),
                  color: TEXT_CREAM, textShadow: '0 4px 10px rgba(0,0,0,0.25)',
                },
                children: 'Ready in 2 minutes',
              },
            },
          },
        },
        // Photo zone -- fixed bounding box locked to the space below the
        // text safe zone. No rotation: level every time, and the source
        // image is pre-cropped (subjectCrop.js) to exactly this box's
        // aspect ratio, so object-fit here is a safety net, not the crop.
        {
          type: 'div',
          props: {
            style: {
              display: 'flex', position: 'absolute', top: zones.photoTop, left: 0,
              width: zones.photoWidth, height: zones.photoHeight,
              overflow: 'hidden', boxShadow: '0 -10px 30px rgba(0,0,0,0.15)',
            },
            children: {
              type: 'img',
              props: { src: photoDataUri, width: zones.photoWidth, height: zones.photoHeight, style: { objectFit: 'cover' } },
            },
          },
        },
        // Bottom tagline bar -- real Canva chevron asset at both ends.
        {
          type: 'div',
          props: {
            style: {
              display: 'flex', position: 'absolute', left: Math.round(width * 0.03), top: barY,
              width: width - Math.round(width * 0.06), height: zones.barHeight, borderRadius: zones.barHeight / 2,
              backgroundColor: 'rgba(20,14,8,0.5)', border: '2px solid rgba(255,231,194,0.35)',
              alignItems: 'center', justifyContent: 'center', padding: `0 ${Math.round(width * 0.05)}px`,
            },
            children: [
              chevronIcon(chevronDataUri, chevronSize),
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex', color: TEXT_CREAM, fontFamily: 'Baloo 2', fontWeight: 500, lineHeight: 1.1,
                    fontSize: barFontSize, letterSpacing: 0.5, textAlign: 'center', flex: 1, justifyContent: 'center',
                    marginLeft: 16, marginRight: 16,
                  },
                  children: tagline,
                },
              },
              chevronIcon(chevronDataUri, chevronSize),
            ],
          },
        },
      ],
    },
  }
}

async function renderPng(tree, width, height) {
  const satori = await getSatori()
  const svg = await satori(tree, { width, height, fonts: await getFonts() })
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: width } })
  return resvg.render().asPng()
}

// Runs autofit against the fixed title-zone geometry for a given canvas
// size -- shared by both formats and by the caller (adminMarketing.js) if
// it needs to know up front whether a name will fit.
function fitTitleForCanvas(width, height, name, hasProteinLine) {
  const zones = getLayoutZones(width, height)
  const sidePadding = Math.round(width * 0.06)
  const maxWidth = width - sidePadding * 2
  return autofitTitle({
    name,
    hasProteinLine,
    maxFontSize: getCeilingFontSize(maxWidth),
    minFontSize: Math.round(width * 0.045),
    step: 2,
    maxWidth,
    maxLines: 2,
    lineHeight: 1.16,
    maxBlockHeight: zones.titleZoneHeight - Math.round(height * 0.05),
    proteinGap: 4,
  })
}

// protein.photoBuffer/photoMimeType must be the real, already-retouched
// photo (see photoEditor.js) -- this function owns cropping it to this
// render's exact photo-zone box (see subjectCrop.js/getLayoutZones), since
// the target aspect ratio is a layout concern the renderer already knows.
// protein.name is used both to render and as the color/tagline seed, so the
// same dish always renders the same way.
//
// Returns { png, fits, tagVisible } -- fits:false means even the minimum
// font size couldn't get the name under 2 lines within the title zone;
// tagVisible:false means the branded tag wasn't found in the source photo.
// Either should be treated as a validation failure (flag for manual
// review) by the caller rather than silently serving a bad result.
async function renderCard(protein, width, height) {
  const zones = getLayoutZones(width, height)
  const [cropResult, chevronDataUri] = await Promise.all([
    cropToSubject(protein.photoBuffer, protein.photoMimeType, zones.photoWidth, zones.photoHeight),
    getChevronDataUri(),
  ])
  const photoDataUri = await imageToDataUri(cropResult.buffer)
  const titleFit = fitTitleForCanvas(width, height, protein.name, protein.protein_g != null)
  const tree = buildTree({
    width, height, photoDataUri, chevronDataUri, name: protein.name,
    proteinG: protein.protein_g != null ? Math.round(parseFloat(protein.protein_g)) : null,
    seed: protein.name, titleFit,
  })
  return { png: await renderPng(tree, width, height), fits: titleFit.fits, tagVisible: cropResult.tagVisible }
}

const CAROUSEL_SIZE = { width: 1080, height: 1350 }
const STORY_SIZE = { width: 1080, height: 1920 }

async function renderCarouselCard(protein) {
  return renderCard(protein, CAROUSEL_SIZE.width, CAROUSEL_SIZE.height)
}

async function renderStoryCard(protein) {
  return renderCard(protein, STORY_SIZE.width, STORY_SIZE.height)
}

module.exports = {
  renderCarouselCard, renderStoryCard, getLayoutZones,
  CAROUSEL_SIZE, STORY_SIZE,
}
