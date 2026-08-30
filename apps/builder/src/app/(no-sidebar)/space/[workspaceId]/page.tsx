import { redirect } from "next/navigation"

type SpacePageProps = {
  params: Promise<{ workspaceId: string }>
}

export default async function SpaceIndexPage({ params }: SpacePageProps) {
  const { workspaceId } = await params
  redirect(`/space/${workspaceId}/flows`)
}
