import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createWorkerEngine } from './infrastructure/worker/engine-client.js'
import { App } from './presentation/app.js'
import { createAppStore } from './presentation/store.js'
import './presentation/styles.css'

/** The only place where the interface meets the engine. */
const engine = createWorkerEngine(
  () =>
    new Worker(new URL('./infrastructure/worker/engine.worker.ts', import.meta.url), {
      type: 'module',
    }),
)

const root = document.getElementById('root')
if (root === null) throw new Error('index.html has no #root')

createRoot(root).render(
  <StrictMode>
    <App app={createAppStore(engine)} />
  </StrictMode>,
)
