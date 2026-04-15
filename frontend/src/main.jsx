import { createRoot } from 'react-dom/client'
import '@material/web/all.js'
import './index.css'
import App from './App.jsx'
import { applyMaterialKioskTheme } from './board/theme/materialTheme'

applyMaterialKioskTheme()

createRoot(document.getElementById('root')).render(<App />)
