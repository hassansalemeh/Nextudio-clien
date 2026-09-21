// One-off, re-runnable import of the real invoice NEX_INV_234 (issued from Wave to JMP on 27 Aug 2026).
//   npx tsx src/import-invoice-234.ts
// Safe to run again: nothing is created if the invoice number already exists.
import { pool } from '../../src/db'

const NUMBER = 'NEX_INV_234'

const DELIVERABLES = 'List OF Deliverables :\n-  Cladding elevations.\n- Sections.\n- Wall sections.\n- Cutting list.\n- BOQ.'

const ITEMS = [
  { name: 'Execution Drawings (ED)', description: `Main Villa (SBM)\n${DELIVERABLES}`, quantity: 1, unit_price: 2600 },
  { name: 'Execution Drawings (ED)', description: `Prince House (SBM)\n${DELIVERABLES}`, quantity: 1, unit_price: 1000 },
  { name: 'Execution Drawings (ED)', description: `Main Villa (FBM)\n${DELIVERABLES}`, quantity: 1, unit_price: 3600 },
]

const NOTES = `- Account Number: 0011-112788-003
- Customer Full Name: NEXTUDIO S.A.R.L
- IBAN Number: LB69 0063 0000 0000 0111 1278 8003
- Bank Name: Lebanese Swiss Bank S.A.L
- Bank Swift Code: LEBSLBBX
- Bank Address: Chahin bldg.-GF-Sainte Therese Street-Hadath- Baabda-Lebanon
Payment terms :
- 50% upon confirmation and commencement of the project.
- 30% upon submission of the Week 4 deliverables.
- 10% upon submission of the final deliverables at the end of Week 6.
- 10% upon final review and approval of the submitted deliverables.
Timeline:
Week 1: Prince House
Weeks 2 to 5: Main Villa (SBM) + MAin Villa (FBM)
Week 6: Cutting List & Bill of Quantities .
Notes :
All fences, small buildings, and landscape cladding are excluded from this quotation. If any of these items are requested at a later stage, they will be quoted separately as a Variation Order (V.O.).`

async function main() {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const existing = await client.query('SELECT id FROM invoices WHERE invoice_number = $1', [NUMBER])
    if (existing.rows.length > 0) {
      console.log(`${NUMBER} already exists (id ${existing.rows[0].id}); nothing to do`)
      await client.query('ROLLBACK')
      return
    }

    const jmp = (await client.query("SELECT id FROM clients WHERE lower(name) = 'jmp'")).rows[0]
    if (!jmp) throw new Error('Client JMP not found')
    const sbm = (await client.query("SELECT id, source_invoice_id FROM projects WHERE lower(name) = 'sbm'")).rows[0]
    if (!sbm) throw new Error('Project SBM not found')
    if (sbm.source_invoice_id) throw new Error('SBM is already linked to another invoice')

    // The real JMP billing contact printed on the invoice
    await client.query('UPDATE clients SET contact_name = $2, phone = $3, email = $4 WHERE id = $1', [
      jmp.id,
      'Jumana Hassouna',
      '+961 70 982 317',
      'jumana.hassouna@googlemail.com',
    ])

    const subtotal = ITEMS.reduce((sum, item) => sum + item.quantity * item.unit_price, 0) // 7,200
    const discount = 500 // "Additional Discount" on the invoice
    const total = subtotal - discount // 6,700

    const invoice = (
      await client.query(
        `INSERT INTO invoices (estimate_id, invoice_number, client_id, contact_name, title, summary, invoice_date, due_date,
                               currency, notes, subtotal, discount_type, discount_value, discount, total)
         VALUES (NULL, $1, $2, 'Jumana Hassouna', 'Invoice', 'SBM VILLA -STONE CLADDING - EXECUTION DRAWINGS',
                 '2026-08-27', '2026-08-27', 'USD', $3, $4, 'fixed', $5, $5, $6) RETURNING id`,
        [NUMBER, jmp.id, NOTES, subtotal, discount, total]
      )
    ).rows[0]

    for (const [index, item] of ITEMS.entries()) {
      // The original invoice has no unit column; each line is one lump-sum piece of work
      await client.query(
        `INSERT INTO invoice_items (invoice_id, position, name, description, quantity, unit, unit_price)
         VALUES ($1, $2, $3, $4, $5, 'ls', $6)`,
        [invoice.id, index, item.name, item.description, item.quantity, item.unit_price]
      )
    }

    // Link it to the SBM project (same client, and its confirmed fee is this invoice's total)
    await client.query('UPDATE projects SET source_invoice_id = $2 WHERE id = $1', [sbm.id, invoice.id])

    await client.query('COMMIT')
    console.log(`Imported ${NUMBER}: subtotal ${subtotal}, discount ${discount}, total ${total}, linked to project SBM`)
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw err
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.log('Import failed:', err.message)
  process.exit(1)
})
