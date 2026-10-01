type Props = {
  size?: 'sm' | 'md'
  className?: string
}

// CSS-only spinner (see .spinner in index.css). Used inside buttons and page/section loading states.
function Spinner({ size = 'sm', className }: Props) {
  return <span className={`spinner spinner-${size}${className ? ` ${className}` : ''}`} role="status" aria-label="Loading" />
}

export default Spinner
