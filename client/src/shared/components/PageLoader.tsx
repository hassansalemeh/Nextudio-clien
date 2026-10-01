import Spinner from './Spinner'

type Props = {
  label?: string
}

// Shown in place of a page/section's content while its data is loading, instead of an empty or half-filled page.
function PageLoader({ label = 'Loading...' }: Props) {
  return (
    <div className="page-loader">
      <Spinner size="md" />
      <span>{label}</span>
    </div>
  )
}

export default PageLoader
