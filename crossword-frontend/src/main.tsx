import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { store } from './store/store'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './context/AuthContext'
// Import auth service to set up axios interceptor
import './services/auth'

import { registerSW } from 'virtual:pwa-register'

registerSW({
  immediate: true,
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider store={store}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </Provider>
  </StrictMode>,
)
