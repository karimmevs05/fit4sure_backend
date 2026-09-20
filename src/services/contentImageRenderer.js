// Renders Instagram-ready carousel/story cards for the Marketing page --
// HTML/CSS-style layout (via satori, the same engine behind Vercel's OG
// image generation) rasterized to PNG (via resvg), no Canva dependency.
// Chosen over a headless-browser (Puppeteer) approach specifically because
// it needs no Chromium on Railway and renders deterministically from a
// plain layout tree.
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
    { name: 'Anton', data: loadFont('Anton-Regular.ttf'), weight: 400, style: 'normal' },
    { name: 'Plus Jakarta Sans', data: loadFont('PlusJakartaSans-Medium.ttf'), weight: 500, style: 'normal' },
    { name: 'Plus Jakarta Sans', data: loadFont('PlusJakartaSans-Bold.ttf'), weight: 700, style: 'normal' },
    { name: 'Plus Jakarta Sans', data: loadFont('PlusJakartaSans-ExtraBold.ttf'), weight: 800, style: 'normal' },
  ]
}

// Fetches a recipe photo (any real URL) and returns it as a data URI --
// satori has no network access of its own, every image it renders has to
// already be a data URI or inline SVG. Downscaled first (sharp) to roughly
// the card's own hero-photo size -- CSS on the <img> node only controls
// display size, not how many bytes satori has to embed/parse, so a
// multi-MB source photo would otherwise bloat every render for no visible
// gain at 1080px wide.
async function imageToDataUri(url, maxWidth = 1400) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Could not fetch image (status ${res.status})`)
  const buffer = Buffer.from(await res.arrayBuffer())
  const resized = await sharp(buffer)
    .resize({ width: maxWidth, withoutEnlargement: true })
    .jpeg({ quality: 88 })
    .toBuffer()
  return `data:image/jpeg;base64,${resized.toString('base64')}`
}

// Same category -> accent color mapping already used across the admin
// dashboard's recipe category badges (CATEGORY_CLASSES in Recipes.tsx) --
// kept in sync manually since it's a fixed, rarely-changing list.
const CATEGORY_COLOR = {
  beef: '#8B4513',
  chicken: '#D97706',
  turkey: '#92400E',
  pork: '#DB7093',
}
const CATEGORY_LABEL = { beef: 'Beef', chicken: 'Chicken', turkey: 'Turkey', pork: 'Pork' }

const BRAND = {
  cream: '#FBF6EE',
  panel: '#F5F0E8',
  brown: '#2E1A10',
  brownMuted: '#755B4C',
  blue: '#2E527F',
  terracotta: '#C9692E',
  calBg: '#E8EEF5', calText: '#134DA1',
  proBg: '#EAF5EC', proText: '#16834A',
  carbBg: '#FFF0E1', carbText: '#DC6500',
  fatBg: '#FDEBEC', fatText: '#D62F3D',
}

function macroPill(value, unit, label, bg, text) {
  return {
    type: 'div',
    props: {
      style: {
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        backgroundColor: bg, borderRadius: 20, padding: '18px 8px', flex: 1,
      },
      children: [
        {
          type: 'div',
          props: {
            style: { display: 'flex', fontFamily: 'Plus Jakarta Sans', fontWeight: 800, fontSize: 40, color: text, lineHeight: 1 },
            children: `${value}${unit}`,
          },
        },
        {
          type: 'div',
          props: {
            style: { display: 'flex', fontFamily: 'Plus Jakarta Sans', fontWeight: 700, fontSize: 18, color: text, opacity: 0.75, marginTop: 6, letterSpacing: 2 },
            children: label,
          },
        },
      ],
    },
  }
}

function buildTree({ width, height, photoDataUri, category, name, calories, protein_g, carbs_g, fat_g, photoHeight, cta }) {
  const categoryColor = CATEGORY_COLOR[category] || BRAND.blue
  const categoryLabel = CATEGORY_LABEL[category] || category

  return {
    type: 'div',
    props: {
      style: {
        width, height, display: 'flex', flexDirection: 'column', backgroundColor: BRAND.cream,
        fontFamily: 'Plus Jakarta Sans',
      },
      children: [
        // Hero photo
        {
          type: 'div',
          props: {
            style: { width, height: photoHeight, display: 'flex', position: 'relative', backgroundColor: '#E3D8C9' },
            children: [
              { type: 'img', props: { src: photoDataUri, width, height: photoHeight, style: { objectFit: 'cover' } } },
              // Category tag, floated over the bottom-left of the photo
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex', position: 'absolute', left: 48, bottom: 40,
                    backgroundColor: categoryColor, borderRadius: 999, padding: '12px 28px',
                  },
                  children: {
                    type: 'div',
                    props: {
                      style: { display: 'flex', color: '#FFFFFF', fontFamily: 'Plus Jakarta Sans', fontWeight: 800, fontSize: 26, letterSpacing: 3 },
                      children: categoryLabel.toUpperCase(),
                    },
                  },
                },
              },
              // Wordmark, top-right
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex', position: 'absolute', right: 48, top: 40,
                    backgroundColor: 'rgba(251,246,238,0.92)', borderRadius: 999, padding: '10px 24px',
                  },
                  children: {
                    type: 'div',
                    props: {
                      style: { display: 'flex', color: BRAND.blue, fontFamily: 'Plus Jakarta Sans', fontWeight: 800, fontSize: 22, letterSpacing: 2 },
                      children: 'FIT 4 SURE',
                    },
                  },
                },
              },
            ],
          },
        },
        // Info panel
        {
          type: 'div',
          props: {
            style: {
              width, height: height - photoHeight, display: 'flex', flexDirection: 'column',
              justifyContent: 'center', padding: '0 48px', gap: 28,
            },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex', fontFamily: 'Anton', fontWeight: 400, fontSize: 64, color: BRAND.brown,
                    lineHeight: 1.02, letterSpacing: 0.5,
                  },
                  children: name,
                },
              },
              {
                type: 'div',
                props: {
                  style: { display: 'flex', gap: 14 },
                  children: [
                    macroPill(calories, '', 'CAL', BRAND.calBg, BRAND.calText),
                    macroPill(protein_g, 'g', 'PROTEIN', BRAND.proBg, BRAND.proText),
                    macroPill(carbs_g, 'g', 'CARBS', BRAND.carbBg, BRAND.carbText),
                    macroPill(fat_g, 'g', 'FAT', BRAND.fatBg, BRAND.fatText),
                  ],
                },
              },
              cta && {
                type: 'div',
                props: {
                  style: {
                    display: 'flex', alignSelf: 'flex-start', backgroundColor: BRAND.terracotta,
                    borderRadius: 999, padding: '22px 44px',
                  },
                  children: {
                    type: 'div',
                    props: {
                      style: { display: 'flex', color: '#FFFFFF', fontFamily: 'Plus Jakarta Sans', fontWeight: 800, fontSize: 28, letterSpacing: 2 },
                      children: cta,
                    },
                  },
                },
              },
            ].filter(Boolean),
          },
        },
        // Accent strip
        { type: 'div', props: { style: { display: 'flex', width, height: 14, backgroundColor: BRAND.terracotta } } },
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

// 1080x1350 (4:5) -- Instagram's tallest allowed feed/carousel ratio, gives
// the most room to both the photo and the macro panel.
async function renderCarouselCard(protein) {
  const photoDataUri = await imageToDataUri(protein.image)
  const width = 1080
  const height = 1350
  const tree = buildTree({ width, height, photoHeight: 840, photoDataUri, ...protein })
  return renderPng(tree, width, height)
}

// 1080x1920 (9:16) -- full-screen Story ratio.
async function renderStoryCard(protein) {
  const photoDataUri = await imageToDataUri(protein.image)
  const width = 1080
  const height = 1920
  const tree = buildTree({ width, height, photoHeight: 1360, photoDataUri, cta: 'TAP TO ORDER', ...protein })
  return renderPng(tree, width, height)
}

module.exports = { renderCarouselCard, renderStoryCard }
