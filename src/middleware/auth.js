const jwt = require('jsonwebtoken')
const pool = require('../config/db')

async function requireAuth(req, res, next) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  try {
    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET)
    const result = await pool.query(
      'SELECT user_id, role, is_active, display_name, department, status FROM users WHERE user_id = $1',
      [payload.userId]
    )
    const user = result.rows[0]
    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'Account is inactive or no longer exists' })
    }
    req.userId = user.user_id
    req.userRole = user.role || 'customer'
    req.userName = user.display_name
    req.userEmail = payload.email
    req.userDepartment = user.department
    req.userStatus = user.status
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.userRole || !allowedRoles.includes(req.userRole)) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    next()
  }
}

function optionalAuth(req, res, next) {
  const header = req.headers.authorization
  if (header?.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET)
      req.userId = payload.userId
    } catch {
      // invalid token — continue as guest
    }
  }
  next()
}

module.exports = { requireAuth, optionalAuth, requireRole }
