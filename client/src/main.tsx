import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import App from './App'
import AdminIngest from './components/AdminIngest'
import AdminPanel from './components/AdminPanel'
import Nav from './components/Nav'
import ReportPage from './components/ReportPage'
import StartPage from './components/StartPage'
import CapturePage from './components/CapturePage'
import './styles/global.css'

const root = document.getElementById('root')!
createRoot(root).render(
  <React.StrictMode>
    <BrowserRouter>
      <Nav />
      <Routes>
        <Route path="/admin/ingest" element={<AdminIngest />} />
        <Route path="/admin" element={<AdminPanel />} />
        <Route path="/" element={<StartPage />} />
        <Route path="/capture" element={<CapturePage />} />
        <Route path="/interview" element={<App />} />
        <Route path="/report/:sessionId" element={<ReportPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
)
