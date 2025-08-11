import express from 'express'
import dotenv from 'dotenv'
import pkg from 'pg'

const { Pool } = pkg
dotenv.config()

const app = express()

// Parse JSON
app.use(express.json())

// --- Minimal CORS ---
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Client')
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})
// --------------------

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

// Local dedupe store for HTML uploader -> transactions
async function ensureTables() {
  await pool.query(`CREATE TABLE IF NOT EXISTS dedupe_html (key TEXT PRIMARY KEY);`)
}
ensureTables().catch(err => console.error('❌ ensureTables:', err.message))

function makeKey({ date, description, amount }) {
  const desc = (description || '').trim()
  const amt = Number(amount).toFixed(2)
  return `${date}||${desc}||${amt}`
}

app.post('/insert', async (req, res) => {
  // allow only these tables
  const allowed = new Set(['transactions', 'crosspoint'])
  const table = String(req.body.table || 'transactions').toLowerCase()
  if (!allowed.has(table)) return res.status(400).json({ error: 'Invalid table name' })

  const { date, description, category, amount, currency, type } = req.body
  const isHtmlUploader = String(req.header('X-Client') || '').toLowerCase() === 'html-uploader'

  if (!date || !description || typeof amount !== 'number') {
    return res.status(400).json({ error: 'Missing required fields: date, description, amount' })
  }

  try {
    if (table === 'transactions') {
      // same behavior as before (includes currency and dedupe for html-uploader)
      if (isHtmlUploader) {
        const key = makeKey({ date, description, amount })
        const exists = await pool.query('SELECT 1 FROM dedupe_html WHERE key = $1 LIMIT 1', [key])
        if (exists.rowCount > 0) return res.status(200).json({ message: 'Duplicate (html) skipped', table })
        await pool.query(
          `INSERT INTO transactions (date, description, category, amount, currency, type)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [date, description, category, amount, currency || 'USD', type]
        )
        await pool.query('INSERT INTO dedupe_html (key) VALUES ($1) ON CONFLICT DO NOTHING', [key])
        return res.status(200).json({ message: 'Inserted successfully (html)', table })
      } else {
        await pool.query(
          `INSERT INTO transactions (date, description, category, amount, currency, type)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [date, description, category, amount, currency || 'USD', type]
        )
        return res.status(200).json({ message: 'Inserted successfully', table })
      }
    } else if (table === 'crosspoint') {
      // church table: NO currency column
      await pool.query(
        `INSERT INTO crosspoint (date, description, category, amount, type)
         VALUES ($1,$2,$3,$4,$5)`,
        [date, description, category, amount, type]
      )
      return res.status(200).json({ message: 'Inserted successfully into crosspoint', table })
    }

    return res.status(400).json({ error: 'Unhandled table' }) // defensive
  } catch (err) {
    console.error('❌ INSERT ERROR:', err.message)
    return res.status(500).json({ error: err.message })
  }
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`Server running on port ${PORT}`))


