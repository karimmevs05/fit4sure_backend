// Renders Instagram-ready carousel/story cards for the Marketing page --
// HTML/CSS-style layout (via satori, the same engine behind Vercel's OG
// image generation) rasterized to PNG (via resvg), no Canva dependency for
// rendering itself. The layout below is a deliberate match of Fit4Sure's
// real Canva story template ("Ready in 2 miN (STORY POST MAY)",
// design DAHJAx4BvjY) -- read directly via the Canva API (real hex colors,
// font sizes, element positions, and the brand's own rotating taglines) so
// this reproduces the actual brand system instead of a generic layout.
//
// satori is ESM-only; this file stays CommonJS (like the rest of the
// backend) and loads it via dynamic import.

const fs = require('fs')
const path = require('path')
const sharp = require('sharp')
const { Resvg } = require('@resvg/resvg-js')

const FONT_DIR = path.join(__dirname, '../assets/fonts')
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

// Resolves a photo source -- either { url } (a plain recipe.image URL) or
// { buffer } (real bytes already downloaded, e.g. from a matched Drive
// photo -- see adminMarketing.js) -- to a data URI. satori has no network
// access of its own, every image it renders has to already be a data URI
// or inline SVG. Downscaled first (sharp) to roughly the card's own
// photo-card size -- CSS on the <img> node only controls display size, not
// how many bytes satori has to embed/parse, so a multi-MB source photo
// would otherwise bloat every render for no visible gain at 1080px wide.
async function imageToDataUri(source, maxWidth = 1400) {
  let buffer
  if (source.buffer) {
    buffer = source.buffer
  } else {
    const res = await fetch(source.url)
    if (!res.ok) throw new Error(`Could not fetch image (status ${res.status})`)
    buffer = Buffer.from(await res.arrayBuffer())
  }
  const resized = await sharp(buffer)
    .resize({ width: maxWidth, withoutEnlargement: true })
    .jpeg({ quality: 88 })
    .toBuffer()
  return `data:image/jpeg;base64,${resized.toString('base64')}`
}

// The real template's own background palette -- read directly off 7 pages
// of the Canva deck (background.color.color in the page CDF). Colors don't
// track protein category at all in the source (a steak page is orange, a
// beef-rice-bowl page is olive, a beef-cilantro page is peach) -- it's a
// rotating decorative palette across posts, not a category code. Picked
// deterministically per recipe so the same recipe always renders the same
// color rather than reshuffling on every regenerate.
const BG_PALETTE = ['#ce6415', '#0097b2', '#3c745e', '#e8c48c', '#d8a65b', '#457a00', '#ff9a50']

// The template's own rotating taglines (its actual copy, read verbatim off
// the deck) -- reused rather than invented so the in-image copy matches
// the brand voice already established for this exact placement.
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

function buildTree({ width, height, photoDataUri, name, proteinG, seed, photoHeight, photoTop, headlineScale, subheadlineScale }) {
  const bg = pick(BG_PALETTE, seed)
  const tagline = pick(TAGLINES, seed + '-tag')
  // Alternates tilt direction by seed so consecutive renders don't all lean
  // the same way -- the real deck's own photo rotations vary page to page
  // (roughly +/-7 to +/-16deg) rather than using one fixed angle.
  const tilt = (hashString(seed + '-tilt') % 2 === 0 ? 1 : -1) * (7 + (hashString(seed + '-tilt2') % 8))

  // Sized generously enough to hold a two-line wrap (long taglines like
  // "FOOD THAT KEEPS UP WITH YOU" don't fit one line at this width) without
  // the text spilling past the pill's rounded edge.
  const barHeight = Math.round(height * 0.15)
  const barY = height - barHeight - Math.round(height * 0.018)

  return {
    type: 'div',
    props: {
      style: {
        width, height, display: 'flex', flexDirection: 'column', position: 'relative',
        backgroundColor: bg, fontFamily: 'Baloo 2', overflow: 'hidden',
      },
      children: [
        // Diagonal stripe texture -- an oversized, rotated, low-opacity
        // striped band, matching the real template's subtle background
        // texture (a rotated image at 9% opacity there; a CSS gradient
        // here, same visual effect without needing the source asset).
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
        // Headline block
        {
          type: 'div',
          props: {
            style: {
              display: 'flex', flexDirection: 'column', alignItems: 'center', width, position: 'relative',
              padding: `${Math.round(height * 0.056)}px ${Math.round(width * 0.06)}px 0`,
              textAlign: 'center',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex', fontFamily: 'Baloo 2', fontWeight: 800, fontSize: Math.round(width * headlineScale),
                    color: TEXT_CREAM, lineHeight: 1.16, textAlign: 'center', letterSpacing: 0.5,
                  },
                  children: name.toUpperCase(),
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex', fontFamily: 'Baloo 2', fontWeight: 800, fontSize: Math.round(width * headlineScale),
                    color: TEXT_CREAM, lineHeight: 1.16, textAlign: 'center', marginTop: 4,
                  },
                  children: `${proteinG}G PROTEIN`,
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex', fontFamily: 'Caveat', fontWeight: 700, fontSize: Math.round(width * subheadlineScale),
                    color: TEXT_CREAM, marginTop: Math.round(height * 0.012),
                  },
                  children: 'Ready in 2 minutes',
                },
              },
            ],
          },
        },
        // Photo card -- tilted, rounded, oversized so it bleeds past the
        // frame edges like the real template's angled photo insert,
        // revealing the colored/striped backdrop around it.
        {
          type: 'div',
          props: {
            style: {
              display: 'flex', position: 'absolute', top: photoTop, left: width * 0.5 - (width * 0.98) / 2,
              width: width * 0.98, height: photoHeight, borderRadius: 28,
              transform: `rotate(${tilt}deg)`, overflow: 'hidden', boxShadow: '0 30px 60px rgba(0,0,0,0.35)',
            },
            children: {
              type: 'img',
              props: { src: photoDataUri, width: width * 0.98, height: photoHeight, style: { objectFit: 'cover' } },
            },
          },
        },
        // Bottom tagline bar
        {
          type: 'div',
          props: {
            style: {
              display: 'flex', position: 'absolute', left: Math.round(width * 0.03), top: barY,
              width: width - Math.round(width * 0.06), height: barHeight, borderRadius: barHeight / 2,
              backgroundColor: 'rgba(20,14,8,0.55)', alignItems: 'center', justifyContent: 'center',
              padding: `0 ${Math.round(width * 0.045)}px`,
            },
            children: [
              {
                type: 'div',
                props: {
                  style: { display: 'flex', color: TEXT_CREAM, fontFamily: 'Baloo 2', fontWeight: 800, fontSize: Math.round(barHeight * 0.28), marginRight: 10 },
                  children: '»',
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex', color: TEXT_CREAM, fontFamily: 'Baloo 2', fontWeight: 600, lineHeight: 1.15,
                    fontSize: Math.round(barHeight * 0.18), letterSpacing: 0.5, textAlign: 'center', flex: 1, justifyContent: 'center',
                  },
                  children: tagline,
                },
              },
              {
                type: 'div',
                props: {
                  style: { display: 'flex', color: TEXT_CREAM, fontFamily: 'Baloo 2', fontWeight: 800, fontSize: Math.round(barHeight * 0.28), marginLeft: 10 },
                  children: '«',
                },
              },
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

// protein.photoSource is { url } (falls back to the recipe's own
// recipe.image) or { buffer } (a real photo already downloaded from Drive
// -- see findDrivePhotoForRecipe in adminMarketing.js). Preferring a real
// Drive photo over the recipe's reference image is the whole point --
// content built from an actual product photo is what's expected to
// perform, not a generic recipe-lookup image. protein.name is used both
// to render and as the color/tagline/tilt seed, so the same recipe always
// renders the same way.
//
// The Canva reference we matched (DAHJAx4BvjY) is the Story format; the
// carousel below applies the same real brand system (palette, fonts,
// tilted photo card, tagline bar) at the 4:5 ratio since no separate
// carousel template was shared -- consistency with the verified Story
// design over a second invented layout.
async function renderCarouselCard(protein) {
  const photoDataUri = await imageToDataUri(protein.photoSource)
  const width = 1080
  const height = 1350
  const tree = buildTree({
    width, height, photoDataUri, name: protein.name, proteinG: Math.round(parseFloat(protein.protein_g)), seed: protein.name,
    // Smaller headline + earlier, shorter photo card than the Story format --
    // 4:5 has much less vertical room than 9:16, so the same font/spacing
    // ratios that work for Story push the photo into the tagline bar here.
    headlineScale: 0.082, subheadlineScale: 0.05,
    photoHeight: Math.round(height * 0.46), photoTop: Math.round(height * 0.42),
  })
  return renderPng(tree, width, height)
}

async function renderStoryCard(protein) {
  const photoDataUri = await imageToDataUri(protein.photoSource)
  const width = 1080
  const height = 1920
  const tree = buildTree({
    width, height, photoDataUri, name: protein.name, proteinG: Math.round(parseFloat(protein.protein_g)), seed: protein.name,
    headlineScale: 0.108, subheadlineScale: 0.062,
    photoHeight: Math.round(height * 0.435), photoTop: Math.round(height * 0.345),
  })
  return renderPng(tree, width, height)
}

module.exports = { renderCarouselCard, renderStoryCard }
