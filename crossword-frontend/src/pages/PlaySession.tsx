import { useParams } from 'react-router-dom'
import { PlaySessionDesktopView, PlaySessionMobileView } from './play-session/PlaySessionViews'
import { NicknameModal } from '../components/NicknameModal'
import { usePlaySessionState } from './play-session/usePlaySessionState'

export function PlaySession() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const { loading, grid, showNicknameModal, handleNicknameSubmit, isMobile, viewProps } =
    usePlaySessionState(sessionId)

  if (loading && !grid.length)
    return (
      <div className="flex items-center justify-center min-h-[50vh] text-text-secondary animate-pulse gap-2">
        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
        Loading session...
      </div>
    )

  if (!grid.length)
    return (
      <div className="flex items-center justify-center min-h-[50vh] text-error p-8 bg-error/10 rounded-xl">
        Failed to load puzzle grid.
      </div>
    )

  return (
    <>
      {isMobile ? (
        <PlaySessionMobileView {...viewProps} />
      ) : (
        <PlaySessionDesktopView {...viewProps} />
      )}
      {showNicknameModal && <NicknameModal onSubmit={handleNicknameSubmit} />}
    </>
  )
}
