const express = require('express')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const appleSignin = require('apple-signin-auth')
const { OAuth2Client } = require('google-auth-library')
const pool = require('../config/db')
const { requireAuth } = require('../middleware/auth')

const router = express.Router()
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)

function signToken(user) {
  return jwt.sign(
    { userId: user.user_id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  )
}

async function findOrCreateSocialUser(provider, providerUserId, email, displayName) {
  // Check if identity exists
  const identityResult = await pool.query(
    'SELECT user_id FROM user_identities WHERE provider = $1 AND provider_user_id = $2',
    [provider, providerUserId]
  )
  if (identityResult.rows.length > 0) {
    const userId = identityResult.rows[0].user_id
    const userResult = await pool.query('SELECT * FROM users WHERE user_id = $1', [userId])
    return userResult.rows[0]
  }

  // Check if a user with this email already exists
  let user
  if (email) {
    const emailResult = await pool.query('SELECT * FROM users WHERE email = $1', [email])
    user = emailResult.rows[0]
  }

  // Create user if not found
  if (!user) {
    const newUser = await pool.query(
      'INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING *',
      [email || null, displayName || null]
    )
    user = newUser.rows[0]
  }

  // Link identity
  await pool.query(
    'INSERT INTO user_identities (user_id, provider, provider_user_id) VALUES ($1, $2, $3)',
    [user.user_id, provider, providerUserId]
  )

  return user
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { email, password, displayName } = req.body
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' })
  }
  try {
    const existing = await pool.query('SELECT user_id FROM users WHERE email = $1', [email])
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists' })
    }
    const passwordHash = await bcrypt.hash(password, 12)
    const result = await pool.query(
      'INSERT INTO users (email, password_hash, display_name) VALUES ($1, $2, $3) RETURNING *',
      [email, passwordHash, displayName || null]
    )
    const user = result.rows[0]
    await pool.query(
      'INSERT INTO user_identities (user_id, provider, provider_user_id) VALUES ($1, $2, $3)',
      [user.user_id, 'email', email]
    )
    res.status(201).json({ user, token: signToken(user) })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' })
  }
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email])
    const user = result.rows[0]
    if (!user || !user.password_hash) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }
    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }
    res.json({ user, token: signToken(user) })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/auth/apple
router.post('/apple', async (req, res) => {
  const { identityToken, fullName } = req.body
  if (!identityToken) {
    return res.status(400).json({ error: 'identityToken is required' })
  }
  try {
    const payload = await appleSignin.verifyIdToken(identityToken, {
      audience: process.env.APPLE_CLIENT_ID,
      ignoreExpiration: false,
    })
    const displayName = fullName
      ? `${fullName.givenName || ''} ${fullName.familyName || ''}`.trim()
      : null
    const user = await findOrCreateSocialUser('apple', payload.sub, payload.email, displayName)
    res.json({ user, token: signToken(user) })
  } catch (err) {
    res.status(401).json({ error: 'Apple Sign-In failed: ' + err.message })
  }
})

// POST /api/auth/google
router.post('/google', async (req, res) => {
  const { idToken } = req.body
  if (!idToken) {
    return res.status(400).json({ error: 'idToken is required' })
  }
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    })
    const payload = ticket.getPayload()
    const user = await findOrCreateSocialUser(
      'google',
      payload.sub,
      payload.email,
      payload.name || null
    )
    res.json({ user, token: signToken(user) })
  } catch (err) {
    res.status(401).json({ error: 'Google Sign-In failed: ' + err.message })
  }
})

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT user_id, email, display_name, phone_number, address_line1, address_line2, city, state, postal_code, is_active, created_at FROM users WHERE user_id = $1',
      [req.userId]
    )
    if (!result.rows[0]) return res.status(404).json({ error: 'User not found' })
    res.json(result.rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
