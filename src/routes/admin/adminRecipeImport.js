const express = require('express')
const { requireAuth, requireRole } = require('../../middleware/auth')
const { importFromUrl, importFromImage } = require('../../services/recipeImportService')

const router = express.Router()

// POST /api/admin/recipe-import/extract
// Body: { url: string } OR { imageBase64: string, mimeType?: string }
//
// Returns { recipes: [...] } -- one entry per distinct recipe found on the
// page (almost always one, but a source can bundle several, e.g. a main
// dish with its own sauce, or a roundup post). Nothing is written to the
// database here; each entry is a draft ready for the review screen.
// Ingredients come back either matched to a real inventory_id (ready to
// auto-fill) or unmatched (name only, needs a human to resolve via the
// existing IngredientPicker flow).
router.post('/extract', requireAuth, requireRole('admin'), async (req, res) => {
  const { url, imageBase64, mimeType } = req.body

  if (!url && !imageBase64) {
    return res.status(400).json({ error: 'Provide either url or imageBase64' })
  }

  try {
    const result = url ? await importFromUrl(url) : await importFromImage(imageBase64, mimeType)
    res.json({ data: result })
  } catch (err) {
    console.error('Recipe import extraction error:', err)
    res.status(500).json({ error: err.message || 'Failed to extract recipe' })
  }
})

module.exports = router
