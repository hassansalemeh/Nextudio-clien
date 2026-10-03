import { useId } from 'react'
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts'
import EmptyState from './EmptyState'

type ProjectValue = {
  project_id: string
  name: string
  amount: number
  deducted: number
}

type Props = {
  projects: ProjectValue[]
  limit?: number
}

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const compactMoney = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1,
})

function ProjectValueChart({ projects, limit = 5 }: Props) {
  const titleId = useId()
  // Rank a copy for the chart; the original records and their financial values stay intact.
  const chartProjects = [...projects].sort((a, b) => b.deducted - a.deducted || b.amount - a.amount).slice(0, limit)
  const hasValues = chartProjects.some((project) => project.amount !== 0 || project.deducted !== 0)

  return (
    <figure className="card chart-panel" aria-labelledby={titleId}>
      <figcaption>
        <h2 id={titleId}>How does project value compare with staff cost?</h2>
        <p className="chart-note">
          {projects.length > limit ? `The ${limit} projects with the highest staff costs.` : 'Confirmed fees and the cost of recorded staff time.'}
          {' '}Amounts in USD; pending fees count as $0.
        </p>
      </figcaption>
      {hasValues ? (
        <>
          <div className="chart-legend" aria-label="Chart legend">
            <span><i className="chart-key" />Confirmed value</span>
            <span><i className="chart-key chart-key-secondary" />Staff cost</span>
          </div>
          <BarChart
            responsive
            style={{ width: '100%', height: Math.max(180, chartProjects.length * 44 + 30) }}
            data={chartProjects}
            layout="vertical"
            margin={{ top: 6, right: 12, bottom: 0, left: 0 }}
            accessibilityLayer
          >
            <CartesianGrid horizontal={false} stroke="var(--color-border)" strokeDasharray="3 4" />
            <XAxis type="number" tickFormatter={(value) => compactMoney.format(Number(value))} tickLine={false} axisLine={false} tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} />
            <YAxis
              type="category"
              dataKey="name"
              width={110}
              interval={0}
              tickLine={false}
              axisLine={false}
              tick={({ x, y, payload }) => (
                <text x={x} y={y} dy={4} textAnchor="end" fill="var(--color-text-muted)" fontSize={11}>
                  <title>{payload.value}</title>
                  {payload.value.length > 18 ? `${payload.value.slice(0, 17)}…` : payload.value}
                </text>
              )}
            />
            <Tooltip cursor={{ fill: 'var(--color-surface-subtle)' }} formatter={(value) => money.format(Number(value))} contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontSize: 13 }} />
            <Bar dataKey="amount" name="Confirmed value" fill="var(--color-accent)" radius={[0, 3, 3, 0]} maxBarSize={12} isAnimationActive={false} />
            <Bar dataKey="deducted" name="Staff cost" fill="var(--color-chart-secondary)" radius={[0, 3, 3, 0]} maxBarSize={12} isAnimationActive={false} />
          </BarChart>
          <details className="chart-values">
            <summary>View chart values</summary>
            <ul>
              {chartProjects.map((project) => (
                <li key={project.project_id}><strong>{project.name}</strong><span>Confirmed value {money.format(project.amount)} · Staff cost {money.format(project.deducted)}</span></li>
              ))}
            </ul>
          </details>
        </>
      ) : (
        <EmptyState message={projects.length === 0 ? 'Create a project to see its value and staff cost here.' : 'A confirmed fee or recorded staff cost will appear here when available.'} />
      )}
    </figure>
  )
}

export default ProjectValueChart
