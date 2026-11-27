import { ChevronRightIcon } from '../../../shared/components/icons'
import styles from '../SiteVisits.module.css'

export type SiteVisitCardRow = {
  id: string
  weekday: string
  day: number
  title: string
  meta: string
  pressable: boolean
}

export type SiteVisitCardChip = {
  key: string
  label: string
  count: number
}

type Props = {
  name: string
  totalVisits: number
  chips: SiteVisitCardChip[]
  rows: SiteVisitCardRow[]
  onRowClick: (id: string) => void
}

// One card, shared by both the "By person" and "By project" summary tabs - only what heads the card
// (a visitor vs. a project) and what each row names (a project vs. a visitor) differ between the two.
function SiteVisitCard({ name, totalVisits, chips, rows, onRowClick }: Props) {
  return (
    <div className={`card ${styles.visitCard}`}>
      <div className={styles.cardHeader}>
        <div className={styles.avatar} aria-hidden="true">
          {name.charAt(0).toUpperCase()}
        </div>
        <div>
          <h2>{name}</h2>
          <p className={styles.summaryCount}>
            {totalVisits} visit{totalVisits === 1 ? '' : 's'} this month
          </p>
        </div>
      </div>

      {chips.length > 0 && (
        <div className={styles.chipRow}>
          {chips.map((chip) => (
            <span className={styles.chip} key={chip.key}>
              {chip.label} · {chip.count}
            </span>
          ))}
        </div>
      )}

      <div className={styles.cardDivider} />

      <div className={styles.rowList}>
        {rows.map((row) => {
          const content = (
            <>
              <span className={styles.rowDate}>
                <span className={styles.rowDateWeekday}>{row.weekday}</span>
                <span className={styles.rowDateDay}>{row.day}</span>
              </span>
              <span className={styles.rowBody}>
                <span className={styles.rowTitle}>{row.title}</span>
                <span className={styles.rowMeta}>{row.meta}</span>
              </span>
              {row.pressable && <ChevronRightIcon size={16} />}
            </>
          )
          return row.pressable ? (
            <button type="button" key={row.id} className={styles.row} onClick={() => onRowClick(row.id)}>
              {content}
            </button>
          ) : (
            <div key={row.id} className={`${styles.row} ${styles.rowStatic}`}>
              {content}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default SiteVisitCard
