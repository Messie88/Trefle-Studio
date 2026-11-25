'use client'

import KineticCluster from "../components/test-import"

export default function LabPage() {
  // Explicit viewport height: the canvas is sized at 100% of its parent.
  return (
    <main className="h-svh w-full overflow-hidden">
      <KineticCluster modelUrl="/mms.glb" />
    </main>
  )
}
