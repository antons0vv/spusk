import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createWorkerEngine } from './infrastructure/worker/engine-client.js'
import { App } from './presentation/app.js'
import { createAppStore } from './presentation/store.js'
import './presentation/styles.css'

/** Единственное место, где интерфейс встречается с движком. */
const engine = createWorkerEngine(
  () =>
    new Worker(new URL('./infrastructure/worker/engine.worker.ts', import.meta.url), {
      type: 'module',
    }),
)

const root = document.getElementById('root')
if (root === null) throw new Error('в index.html нет #root')

createRoot(root).render(
  <StrictMode>
    <App app={createAppStore(engine)} />
  </StrictMode>,
)
