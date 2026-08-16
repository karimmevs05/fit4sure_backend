const express = require('express')
const { requireAuth, requireRole } = require('../../middleware/auth')
const { importFromUrl, importFromImage } = require('../../services/recipeImportService')

const router = express.Router()

// POST /api/admin/recipe-import/extract
// Body: { url: string } OR { imageBase64: string, mimeType?: string }
//
// Returns a draft recipe ready for the review screen -- nothing is written
// to the database here. Ingredients come back either matched to a real
// inventory_id (ready to auto-fill) or unmatched (name only, needs a human
// to resolve via IngredientPicker before it can be saved).
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
