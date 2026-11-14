import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import '@astryxdesign/core/reset.css'
import '@astryxdesign/core/astryx.css'
import './looseleaf.css'
import './style.css'
import './intake.css'
import { InkProvider } from './lib/ink/react'
import { Theme } from '@astryxdesign/core/theme'
import { themes, defaultThemeSlug } from './astryx-themes'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><Theme theme={themes[defaultThemeSlug]} mode="light"><InkProvider><App /></InkProvider></Theme></React.StrictMode>,
)
