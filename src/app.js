require('dotenv').config()
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')

const authRoutes = require('./routes/auth')
const mealsRoutes = require('./routes/meals')
const weeklyMenusRoutes = require('./routes/weeklyMenus')
const deliveryZonesRoutes = require('./routes/deliveryZones')
const boxesRoutes = require('./routes/boxes')
const dietProfilesRoutes = require('./routes/dietProfiles')
const mealLogsRoutes = require('./routes/mealLogs')
const xpRoutes = require('./routes/xp')
const bulkDiscountsRoutes = require('./routes/bulkDiscounts')
const paymentsRoutes = require('./routes/payments')

const app = express()

app.use(helmet())
app.use(cors({ origin: '*', allowedHeaders: ['Content-Type', 'Authorization'] }))

// Stripe webhook needs raw body — must be before express.json()
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }))
app.use(express.json())

app.use('/api/auth', authRoutes)
app.use('/api/meals', mealsRoutes)
app.use('/api/weekly-menus', weeklyMenusRoutes)
app.use('/api/delivery-zones', deliveryZonesRoutes)
app.use('/api/boxes', boxesRoutes)
app.use('/api/diet-profile', dietProfilesRoutes)
app.use('/api/meal-logs', mealLogsRoutes)
app.use('/api/xp', xpRoutes)
app.use('/api/bulk-discounts', bulkDiscountsRoutes)
app.use('/api/payments', paymentsRoutes)

app.get('/health', (req, res) => res.json({ status: 'ok' }))

module.exports = app
