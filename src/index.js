require('dotenv').config()
const app = require('./app')
const cron = require('node-cron')
const { startAutoReceiptSync } = require('./services/googleDriveSync')
const { runDueSteps, checkTimeTriggers } = require('./services/automationEngine')
const { generateReportForMostRecentPeriod } = require('./routes/admin/adminFinancials')

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

  // Once a day: generate the semi-monthly financial report snapshot if the
  // just-completed half-month period doesn't have one yet. Idempotent --
  // generateReportForMostRecentPeriod() no-ops if it already exists.
  cron.schedule('0 6 * * *', async () => {
    try {
      const result = await generateReportForMostRecentPeriod()
      if (!result.alreadyExists) {
        console.log(`Generated financial report snapshot id=${result.id}`)
      }
    } catch (err) {
      console.error('Financial report scheduler error:', err)
    }
  })
})
