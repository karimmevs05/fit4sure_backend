const jwt = require('jsonwebtoken')

function requireAuth(req, res, next) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  try {
    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET)
    req.userId = payload.userId
    req.userRole = payload.role || 'customer'
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
