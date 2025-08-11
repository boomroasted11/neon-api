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

// Create a tiny per-uploader dedupe table (no change to your transactions schema)
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
  const desc = (description || '').trim()           // exact match (case-sensitive by default in Postgres)
  const amt = Number(amount).toFixed(2)             // normalize to 2 decimals
  return `${date}||${desc}||${amt}`
}

app.post('/insert', async (req, res) => {
  const { date, description, category, amount, currency, type } = req.body
  const isHtmlUploader = String(req.header('X-Client') || '').toLowerCase() === 'html-uploader'

  if (!date || !description || typeof amount !== 'number') {
    return res.status(400).json({ error: 'Missing required fields: date, description, amount' })
  }

  try {
    if (isHtmlUploader) {
      const key = makeKey({ date, description, amount })
      // If we've seen this from the HTML uploader before, skip
      const exists = await pool.query('SELECT 1 FROM dedupe_html WHERE key = $1 LIMIT 1', [key])
      if (exists.rowCount > 0) {
        return res.status(200).json({ message: 'Duplicate (html) skipped' })
      }

      // Not seen: insert into transactions, then record the key
      await pool.query(
        'INSERT INTO transactions (date, description, category, amount, currency, type) VALUES ($1, $2, $3, $4, $5, $6)',
        [date, description, category, amount, currency, type]
      )
      await pool.query('INSERT INTO dedupe_html (key) VALUES ($1) ON CONFLICT DO NOTHING', [key])
      return res.status(200).json({ message: 'Inserted successfully (html)' })
    }

    // Non-uploader (e.g., Apple Shortcuts): insert as-is, no dedupe here
    await pool.query(
      'INSERT INTO transactions (date, description, category, amount, currency, type) VALUES ($1, $2, $3, $4, $5, $6)',
      [date, description, category, amount, currency, type]
    )
    return res.status(200).json({ message: 'Inserted successfully' })
  } catch (err) {
    console.error('❌ INSERT ERROR:', err.message)
    return res.status(500).json({ error: err.message })
  }
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})

