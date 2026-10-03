import type { ReactNode } from 'react'

type PageHeaderProps = {
  title: ReactNode
  description: string
  action?: ReactNode
}

function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <div className="page-heading">
      <div className="page-heading-row">
        <h1>{title}</h1>
        {action}
      </div>
      <p>{description}</p>
    </div>
  )
}

export default PageHeader
