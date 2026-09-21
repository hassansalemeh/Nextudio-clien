// One-off, re-runnable import of the real quotation NEX-QUO-DNT-AIN-CD,DD,PC- 0196 (issued from Wave, 16 Sep 2026).
//   npx tsx src/import-estimate-0196.ts
// Safe to run again: nothing is created if the estimate number already exists.
// The text is copied exactly from the original document, including its typos and numbering.
import { computeTotals } from '../../src/estimates'
import { pool } from '../../src/db'

const NUMBER = 'NEX-QUO-DNT-AIN-CD,DD,PC- 0196'

const CD = `Architectural concept design consultancy for a private residential villa in Ainab, Mount Lebanon, including the development of the overall architectural concept, spatial organization, building massing, internal functions and architectural character of the proposed residence.

Estimated Built-Up Area:
- Basement Floor – Garage & Storage: approximately 100 sqm
- Ground Floor: approximately 200 sqm
- First Floor: approximately 200 sqm
- Guard House: approximately 50 sqm
Total Estimated Built-Up Area: approximately 550 sqm

The concept design package shall include:
- Review of the project brief and site requirements.
- Development of the architectural design concept.
- Space planning and functional distribution.
- Conceptual floor plans for all levels.
- Architectural elevations.
- Principal architectural sections.
- 3D architectural model.
- Photorealistic exterior renders illustrating the proposed architectural concept.
- Area schedule.
- Up to two rounds of design revisions during the concept design stage.`

const PC = `The scope is limited to reviewing permit-related comments received from the Client or appointed permit consultant and modifying the architectural design accordingly.

This scope does not include:

* Preparation or production of permit drawings.
* Submission of documents to the relevant authorities.
* Direct coordination or follow-up with authorities.
* Obtaining approvals or permits.
* Stamps, signatures, or professional responsibility from the architect or structural, mechanical, and electrical engineers.

All permit submissions, authority follow-up, professional signatures, and approvals shall be handled by the Client’s appointed licensed consultants.w`

const DD = `Development of the approved architectural concept into a coordinated detailed design and tender documentation package, suitable for preparation of the construction tender and issuance to contractors for competitive bidding.

Scope of Services:

A- Architectural Detailed Drawings
- Detailed floor plans and partition layouts.
- Dimensioned architectural plans.
- Building elevations and sections.
- Staircase plans, sections and relevant architectural details.
- Door and window schedules.
- Floor finish layouts and schedules.
- Ceiling layouts for base-building coordination.
- Wet-area and other relevant architectural details.
- Coordination of architectural drawings with structural and MEP disciplines.

B- Structural Design & Drawings
- Structural design basis and design parameters to be held by another engineer.
-Structural Drawings is out of our scope of work.
C- Mechanical Design & Drawings
- Domestic water-supply layouts.
- Hot- and cold-water distribution.
- Drainage and sewage layouts.
- Rainwater drainage layouts.
- Plumbing risers and typical details.
- Water tanks, pumps and related standard building-service requirements where applicable.
- HVAC layouts and coordination where included within the approved project brief.
- Ventilation requirements for relevant spaces.
- Mechanical equipment schedules and specifications.
- Coordination with architectural and structural drawings.

D- Electrical Design & Drawings
- Electrical power layouts.
- Base-building lighting layouts.
- Distribution boards and electrical schedules.
- Electrical load calculations as required.
- Single-line diagrams.
- Earthing and lightning-protection provisions where applicable.
- Low-voltage cable routing.
- Data, telephone, television and intercom provisions.
- Electrical equipment and fixture schedules.
- Coordination with architectural and mechanical systems.

E- Multidisciplinary Coordination
- Coordination between architectural, structural, electrical and mechanical drawings.
- Review and resolution of major clashes between disciplines prior to tender issuance.
- Coordination of shafts, service routes, structural elements and architectural requirements.
- Preparation of a coordinated drawing package suitable for contractor pricing.

F- Bill of Quantities – BOQ
- Preparation of an itemized BOQ based on the completed tender drawings.
- Quantity take-offs for the principal architectural, electrical and mechanical works.
- Preparation of the BOQ for contractor pricing .`

const ITEMS = [
  { name: 'CD - Concept Design', description: CD, quantity: 550, unit: 'sqm', unit_price: 7 },
  { name: 'PC- Permit Coordination', description: PC, quantity: 550, unit: 'sqm', unit_price: 2.5 },
  { name: 'DD - Design Development', description: DD, quantity: 550, unit: 'sqm', unit_price: 5 },
]

const NOTES = `Payment terms :
1- 35% – Upon appointment / signing of the agreement
2- 35% – Upon completion and submission of Phase 1 Concept Design
4- 15% – Upon completion of the coordinated Detailed Design drawings
5- 15% – Upon submission of the final BOQ and Tender Package
Timeline:
1- Phase 1 – Concept Design | 3–4 Weeks.
3- Phase 2 – Detailed Design & Tender Documentation | 5–6 Weeks.
The stated programme excludes Client review periods, major changes to the approved design, delays in receiving required surveys or technical information, and review/approval periods by OEA, Urban Planning, Municipality, Ministry of Finance or any other governmental authority.
Notes :
Exclusions / Notes :
A_ Architectural Exclusions
- Interior design, furniture layouts, decorative lighting design, joinery design and detailed interior finishes are excluded unless specifically included under a separate agreement.
- Detailed landscape and hardscape design, planting, landscape lighting and landscape irrigation systems are excluded.
- Swimming-pool specialist design and pool filtration/equipment design are excluded unless specifically included.
- Home automation, smart-home systems and BMS are excluded.
- CCTV, access control, security, burglar/intrusion alarm and other specialist low-current systems are excluded unless specifically stated.
- Audio-visual, sound systems and specialist communication systems are excluded.
- Fire-fighting systems beyond standard code/permit requirements, including specialist automatic sprinkler systems where required, shall be separately quoted.
- Solar photovoltaic systems, generators and other specialist energy systems are excluded unless specifically included.
- Specialist kitchen, laundry, elevator or other equipment supplier shop drawings are excluded.
- Geotechnical investigations, land surveying and topographical surveys are excluded and shall be provided by the Client where required.
- Contractor shop drawings, fabrication drawings and as-built drawings remain the responsibility of the appointed contractor and/or specialist subcontractors.
- Material samples, mock-ups and contractor technical submittals are not included within this design phase.
- Construction supervision, site inspections, project management and contract administration are excluded and may be provided under a separate agreement.
- Tender management, contractor prequalification, commercial negotiation and formal tender evaluation are excluded unless specifically included in the agreed scope.
- Any substantial modification to the approved architectural concept after commencement of the detailed design phase shall be considered an additional service.
- Specialist engineering studies or calculations requested by authorities, suppliers or contractors beyond the stated scope shall be separately quoted.
- The BOQ shall be prepared based on the issued tender drawings and available design information. Final quantities remain subject to contractor verification and actual site conditions.
B- Landscape Exclusions :
- Detailed landscape construction drawings are excluded.
- Detailed hardscape construction details, sections and execution drawings are excluded.
- Detailed road and pavement engineering is excluded.
- Structural design of retaining walls, pergolas, canopies, decks or other structural outdoor elements is excluded.
- Detailed grading, stormwater and drainage engineering is excluded.
- Detailed electrical engineering and landscape-lighting calculations are excluded.
- Lighting design is provided at concept level only.
- Detailed irrigation design, hydraulic calculations, pipe sizing, pump sizing and irrigation shop drawings are excluded.
- Irrigation design is provided at concept level only.
- Detailed architectural design of gazebos, outdoor kitchens, pool structures or other standalone outdoor structures is excluded unless specifically quoted separately.
- Swimming-pool engineering and specialist pool systems are excluded.
- Bill of Quantities (BOQ), tender documentation and construction specifications are excluded.
- Contractor shop drawings and fabrication drawings are excluded.
- Construction supervision, site inspections, project management and contract administration are excluded.
- Topographical survey, land survey and geotechnical investigation are excluded and shall be provided by the Client where required.
- The offer includes up to two rounds of design revisions during the conceptual design phase.
- Major changes to the approved concept, architectural design, site configuration or Client brief shall be considered additional services.`

async function main() {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const existing = await client.query('SELECT id FROM estimates WHERE lower(estimate_number) = lower($1)', [NUMBER])
    if (existing.rows.length > 0) {
      console.log(`${NUMBER} already exists (id ${existing.rows[0].id}); nothing to do`)
      await client.query('ROLLBACK')
      return
    }

    const dnt = (
      await client.query("SELECT id FROM clients WHERE lower(name) IN ('design and build limited', 'design & build construction limited')")
    ).rows[0]
    if (!dnt) throw new Error('DNT client not found')
    const project = (await client.query("SELECT id, source_estimate_id FROM projects WHERE lower(name) = 'dnt'")).rows[0]
    if (!project) throw new Error('Project DNT not found')
    if (project.source_estimate_id) throw new Error('DNT is already linked to another estimate')

    // The real client details printed on the quotation
    await client.query('UPDATE clients SET name = $2, contact_name = $3, phone = $4, email = $5 WHERE id = $1', [
      dnt.id,
      'Design & Build Construction Limited',
      'Mazen Safadi',
      '+232 30 333336',
      'Arch.mazen.safadi@gmail.com',
    ])

    const totals = computeTotals(ITEMS, 'fixed', 0) // 3,850 + 1,375 + 2,750 = 7,975

    const estimate = (
      await client.query(
        `INSERT INTO estimates (estimate_number, title, summary, client_id, contact_name, estimate_date, valid_until, currency,
                                status, notes, discount_type, discount_value, project_id, subtotal, discount, total)
         VALUES ($1, 'Quotation', 'DNT PRIVATE RESIDENCE - DESIGN SERVICES', $2, 'Mazen Safadi', '2026-09-16', '2026-09-23', 'USD',
                 'pending', $3, 'fixed', 0, $4, $5, $6, $7) RETURNING id`,
        [NUMBER, dnt.id, NOTES, project.id, totals.subtotal, totals.discount, totals.total]
      )
    ).rows[0]

    for (const [index, item] of ITEMS.entries()) {
      await client.query(
        `INSERT INTO estimate_items (estimate_id, position, name, description, quantity, unit, unit_price)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [estimate.id, index, item.name, item.description, item.quantity, item.unit, item.unit_price]
      )
    }

    await client.query('COMMIT')
    console.log(`Imported ${NUMBER}: total ${totals.total}, status pending, linked to project DNT`)
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
