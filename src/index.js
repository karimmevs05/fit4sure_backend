require('dotenv').config()
const app = require('./app')
const cron = require('node-cron')
const { startAutoReceiptSync } = require('./services/googleDriveSync')
const { runDueSteps, checkTimeTriggers } = require('./services/automationEngine')

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log(`Fit4Sure server running on port ${PORT}`)

  // Receipt sync disabled due to Gemini API quota limits
  // Will re-enable once quota resets or paid plan is active
  // try {
  //   startAutoReceiptSync(5); // Sync every 5 minutes
  // } catch (error) {
  //   console.warn('Could not start receipt sync:', error.message);
  //   console.warn('Make sure Google credentials are configured');
  // }

  // Every 15 minutes: run any automation steps that are due, and check
  // time-based triggers (e.g. "no order in 14 days") for new enrollments.
  cron.schedule('*/15 * * * *', async () => {
    try {
      const executed = await runDueSteps()
      const enrolled = await checkTimeTriggers()
      if (executed > 0 || enrolled > 0) {
        console.log(`Automation tick: ${executed} step(s) executed, ${enrolled} customer(s) newly enrolled`)
      }
    } catch (err) {
      console.error('Automation scheduler error:', err)
    }
  })
})
