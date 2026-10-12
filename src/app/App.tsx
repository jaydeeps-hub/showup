import Alert from '@mui/material/Alert'
import { useState } from 'react'
import { TemporaryUserScreen } from '../features/authentication/TemporaryUserScreen'
import { HomeScreen } from '../features/attendance/HomeScreen'
import { GymSetupScreen } from '../features/gym/GymSetupScreen'
import { useShowup } from '../hooks/useShowup'
import { StorageProblemScreen } from './StorageProblemScreen'

/**
 * Chooses which screen to show based on the saved state:
 * storage problem → welcome (no user) → gym setup (no gym) → home.
 * There is no router: with three screens, a few if-statements are clearer.
 */
export function App() {
  const showup = useShowup()
  const [isChangingGym, setIsChangingGym] = useState(false)

  return (
    <>
      {showup.isNotPersisting && (
        <Alert severity="warning" square>
          Your data is not being saved in this browser and will be lost when you reload.
        </Alert>
      )}
      {renderScreen()}
    </>
  )

  function renderScreen() {
    if (showup.storageStatus === 'corrupted' || showup.storageStatus === 'unavailable') {
      return (
        <StorageProblemScreen
          problem={showup.storageStatus}
          onReset={showup.resetDemoData}
          onContinueWithoutSaving={showup.continueWithoutSaving}
        />
      )
    }

    if (!showup.user) {
      return <TemporaryUserScreen onContinue={showup.createUser} />
    }

    if (!showup.gym || isChangingGym) {
      return (
        <GymSetupScreen
          onSave={(place) => {
            showup.saveGym(place)
            setIsChangingGym(false)
          }}
          onCancel={showup.gym ? () => setIsChangingGym(false) : undefined}
        />
      )
    }

    return (
      <HomeScreen
        username={showup.user.username}
        gym={showup.gym}
        showupCount={showup.showupCount}
        isVerifying={showup.isVerifying}
        onShowUp={showup.showUp}
        onChangeGym={() => setIsChangingGym(true)}
        onResetDemoData={() => {
          setIsChangingGym(false)
          showup.resetDemoData()
        }}
      />
    )
  }
}
