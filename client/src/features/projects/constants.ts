export const STATUS_OPTIONS = [
  { value: 'planning', label: 'Planning' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'on_hold', label: 'On Hold' },
]

export const FEE_STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending / Unconfirmed' },
  { value: 'confirmed', label: 'Confirmed' },
]

export const STATUS_LABELS: Record<string, string> = {
  planning: 'Planning',
  in_progress: 'In Progress',
  completed: 'Completed',
  on_hold: 'On Hold',
}
