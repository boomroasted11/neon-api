import express from 'express'
import dotenv from 'dotenv'
import pkg from 'pg'

const { Pool } = pkg
dotenv.config()

const app = express()

// Parse JSON
app.use(express.json())

// --- Minimal CORS (fixes browser preflight; Shortcuts unaffected) ---
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Client')
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})
// -------------------------------------------------------------------

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

// Per-uploader dedupe table (only used for HTML uploader -> transactions)
async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dedupe_html (
      key TEXT PRIMARY KEY
    );
  `)
}
ensureTables().catch(err => {
  console.error('❌ Failed to ensure dedupe table:', err.message)
})

function makeKey({ date, description, amount }) {
  const desc = (description || '').trim() // case-sensitive
  const amt = Number(amount).toFixed(2)   // normalize to 2 decimals
  return `${date}||${desc}||${amt}`
}

/**
 * Single insert route that can target either "transactions" (default)
 * or "crosspoint", controlled by req.body.table.
 *
 * - Dedupe applies ONLY for X-Client: html-uploader AND table === 'transactions'
 * - Other clients & tables: inserted as-is
 */
app.post('/insert', async (req, res) => {
  // Whitelist allowed tables to avoid SQL injection
  const allowedTables = new Set(['transactions', 'crosspoint'])
  const table = (req.body.table || 'transactions').toString().toLowerCase()

  if (!allowedTables.has(table)) {
    return res.status(400).json({ error: 'Invalid table name' })
  }

  const { date, description, category, amount, currency, type } = req.body
  const isHtmlUploader = String(req.header('X-Client') || '').toLowerCase() === 'html-uploader'

  // Basic validation
  if (!date || !description || typeof amount !== 'number') {
    return res.status(400).json({ error: 'Missing required fields: date, description, amount' })
  }

  // Some clients may omit currency for crosspoint; default to USD
  const safeCurrency = currency || 'USD'

  // SQL with whitelisted identifier
  const insertSql = `
    INSERT INTO ${table} (date, description, category, amount, currency, type)
    VALUES ($1, $2, $3, $4, $5, $6)
  `
  const params = [date, description, category, amount, safeCurrency, type]

  try {
    // Only the HTML uploader to the "transactions" table gets dedupe
    if (isHtmlUploader && table === 'transactions') {
      const key = makeKey({ date, description, amount })
      const exists = await pool.query('SELECT 1 FROM dedupe_html WHERE key = $1 LIMIT 1', [key])
      if (exists.rowCount > 0) {
        return res.status(200).json({ message: 'Duplicate (html) skipped', table })
      }
      await pool.query(insertSql, params)
      await pool.query('INSERT INTO dedupe_html (key) VALUES ($1) ON CONFLICT DO NOTHING', [key])
      return res.status(200).json({ message: 'Inserted successfully (html)', table })
    }

    // All other cases (including crosspoint or non-uploader)
    await pool.query(insertSql, params)
    return res.status(200).json({ message: `Inserted successfully into ${table}` })
  } catch (err) {
    console.error('❌ INSERT ERROR:', err.message)
    return res.status(500).json({ error: err.message })
  }
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})

