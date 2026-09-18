import { useEffect, useMemo } from 'react'
import { neededMarginMm, resolve, type SchemeKind, type Settings } from '../application/settings.js'
import type { PlanError, PlanWarning } from '../domain/plan.js'
import { FORMAT_NAMES } from '../domain/sheet-formats.js'
import { type Pt, toMm } from '../domain/units.js'
import { About } from './about.js'
import { Act, Choice, Gap, Num, Row, Toggles } from './controls.js'
import { Preview } from './preview/preview.js'
import { Shell } from './shell.js'
import type { AppState, LoadedDocument } from './store.js'

type Update = (patch: Partial<Settings>) => void

const mmText = (value: Pt) => String(Math.round(toMm(value) * 10) / 10)

const SCHEMES: readonly (readonly [SchemeKind, string])[] = [
  ['booklet', 'booklet'],
  ['nup', 'n-up'],
  ['stepRepeat', 'step & repeat'],
  ['cutStack', 'cut & stack'],
]

const Unit = () => <span className="text-mute"> mm</span>

const SchemeRows = ({ s, update }: { s: Settings; update: Update }) => {
  const grid = (
    <Row label="grid">
      <Num
        label="rows"
        integer
        min={1}
        max={50}
        value={s.rows}
        onChange={(rows) => update({ rows })}
      />
      <span className="text-mute"> × </span>
      <Num
        label="columns"
        integer
        min={1}
        max={50}
        value={s.cols}
        onChange={(cols) => update({ cols })}
      />
    </Row>
  )
  switch (s.scheme) {
    case 'booklet':
      return (
        <>
          <Row label="signature">
            <Choice<Settings['folio']>
              value={s.folio}
              options={[
                ['all', 'all'],
                [4, '4'],
                [8, '8'],
                [16, '16'],
                [32, '32'],
              ]}
              onChange={(folio) => update({ folio })}
            />
          </Row>
          <Row label="binding">
            <Choice
              value={s.binding}
              options={[
                ['left', 'left'],
                ['right', 'right'],
                ['top', 'top'],
              ]}
              onChange={(binding) => update({ binding })}
            />
          </Row>
          <Row label="creep">
            <Num
              label="creep per sheet"
              step={0.05}
              max={5}
              value={s.creepMm}
              onChange={(creepMm) => update({ creepMm })}
            />
            <Unit />
          </Row>
        </>
      )
    case 'nup':
      return (
        <>
          {grid}
          <Row label="fill">
            <Choice
              value={s.fill}
              options={[
                ['rows', 'across'],
                ['cols', 'down'],
              ]}
              onChange={(fill) => update({ fill })}
            />
          </Row>
        </>
      )
    case 'stepRepeat':
      return (
        <>
          {grid}
          <Row label="copies">
            <Num
              label="copies"
              integer
              min={1}
              max={1000}
              value={s.copies}
              onChange={(copies) => update({ copies })}
            />
          </Row>
        </>
      )
    case 'cutStack':
      return grid
  }
}

const warningText = (w: PlanWarning): string => {
  switch (w.kind) {
    case 'PaddedToFolio':
      return w.added === 1
        ? '1 blank page added at the end'
        : `${w.added} blank pages added at the end`
    case 'MixedPageSizes':
      return 'pages differ in size'
    case 'NoTrimBox':
      return 'no trim box in the file, bleed is taken past the page edge'
  }
}

const Problem = ({ error, update }: { error: PlanError; update: Update }) => {
  // Не влезающие полосы вписываются сами, сюда этот отказ доходит только на битой геометрии.
  if (error.kind === 'DoesNotFit') return <span>pages don’t fit on the sheet</span>
  if (error.what === 'margins') {
    return (
      <>
        <span>margins leave no room for pages</span>
        <Act onClick={() => update({ marginMm: 'auto', gapMm: 0 })}>
          <u>reset margins</u>
        </Act>
      </>
    )
  }
  return (
    <span>
      {error.what === 'document' || error.what === 'pages'
        ? 'this file has no usable pages'
        : 'check the settings'}
    </span>
  )
}

export const WorkScreen = ({
  state,
  doc,
  update,
  show,
  onExport,
  onCancel,
  about,
  onAbout,
  dragging,
}: {
  state: AppState
  doc: LoadedDocument
  update: Update
  show: (sheet: number, back: boolean) => void
  onExport: () => void
  onCancel: () => void
  /** Боковая колонка показывает «о проекте» вместо параметров. */
  about: boolean
  onAbout: (open: boolean) => void
  dragging: boolean
}) => {
  const s = state.settings
  const { info } = doc
  const resolved = useMemo(() => resolve(s, info), [s, info])
  const built = resolved.plan

  const sides = s.scheme === 'booklet' ? 2 : 1
  const sheetCount = built.ok ? Math.ceil(built.value.sheets.length / sides) : 0
  const current = Math.min(state.sheet, Math.max(0, sheetCount - 1))
  const back = sides === 2 && state.back
  // Стрелки идут по всем сторонам подряд: лицо, оборот, следующий лист. Иначе без пробела
  // видна только половина полос брошюры. Пробел переворачивает текущий лист.
  const sideCount = built.ok ? built.value.sheets.length : 0
  const sideIndex = Math.min(current * sides + (back ? 1 : 0), Math.max(0, sideCount - 1))
  const goToSide = (index: number) => {
    const clamped = Math.min(Math.max(index, 0), Math.max(0, sideCount - 1))
    show(Math.floor(clamped / sides), clamped % sides === 1)
  }
  const shown = built.ok ? built.value.sheets[sideIndex] : undefined

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && about) {
        onAbout(false)
        return
      }
      if (e.target instanceof HTMLInputElement) return
      // Пробел на кнопке, куда пришли с клавиатуры, нажимает её, а не листает.
      if (e.key === ' ' && e.target instanceof HTMLButtonElement) return
      if (e.key === 'ArrowRight') goToSide(sideIndex + 1)
      else if (e.key === 'ArrowLeft') goToSide(sideIndex - 1)
      else if (e.key === ' ' && sides === 2) show(current, !back)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const size = info.uniformSize
  const sheetWMm = Math.round(toMm(resolved.sheet.size.w) * 10) / 10
  const sheetHMm = Math.round(toMm(resolved.sheet.size.h) * 10) / 10
  const exporting = state.exporting
  const marksOn = s.marks.crop || (s.marks.fold && s.scheme === 'booklet') || s.marks.registration
  const fileMarks = doc.info.cropMarks
  const marginTooSmall =
    s.marginMm !== 'auto' && s.marginMm < neededMarginMm(s, resolved.bleedMm, fileMarks)
  // Пустой блок предупреждений не должен добавлять отбивку перед экспортом.
  const hasNotes =
    marginTooSmall || (built.ok && (built.value.warnings.length > 0 || resolved.scale < 1))

  const fileLine = dragging ? (
    <span>drop to open another</span>
  ) : (
    <span className="flex min-w-0 flex-wrap gap-x-[1em]">
      <span className="truncate">{doc.file.name}</span>
      <span className="text-mute">
        {info.pageCount} {info.pageCount === 1 ? 'page' : 'pages'}
      </span>
      <span className="text-mute">
        {size === null ? 'mixed sizes' : `${mmText(size.w)} × ${mmText(size.h)}`}
      </span>
    </span>
  )

  const settings = (
    <>
      {fileLine}
      <div className="mt-[1lh]" />
      <div className="grid grid-cols-[4.6em_minmax(0,1fr)] gap-x-[1em]">
        <Row label="scheme">
          <Choice value={s.scheme} options={SCHEMES} onChange={(scheme) => update({ scheme })} />
        </Row>
        <SchemeRows s={s} update={update} />
        <Gap />
        <Row label="sheet">
          <Choice<Settings['format']>
            value={s.format}
            options={[
              ['auto', 'auto'],
              ...FORMAT_NAMES.map((f): readonly [Settings['format'], string] => [f, f]),
              ['custom', 'custom'],
            ]}
            onChange={(format) =>
              // Свой формат начинается с того листа, что сейчас на экране.
              format === 'custom'
                ? update({ format, customWMm: sheetWMm, customHMm: sheetHMm })
                : update({ format })
            }
          />
        </Row>
        <Row>
          <span>
            {s.format === 'auto' && <span className="text-mute">{resolved.sheet.format}, </span>}
            <Num
              label="sheet width"
              lazy
              min={50}
              max={1000}
              muted={s.format !== 'custom'}
              value={sheetWMm}
              onChange={(w) => update({ format: 'custom', customWMm: w, customHMm: sheetHMm })}
            />
            <span className="text-mute"> × </span>
            <Num
              label="sheet height"
              lazy
              min={50}
              max={1000}
              muted={s.format !== 'custom'}
              value={sheetHMm}
              onChange={(h) => update({ format: 'custom', customWMm: sheetWMm, customHMm: h })}
            />
            <Unit />
          </span>
        </Row>
        <Row>
          <Choice
            value={resolved.sheet.orientation}
            options={[
              ['portrait', 'portrait'],
              ['landscape', 'landscape'],
            ]}
            onChange={(orientation) => {
              if (orientation === resolved.sheet.orientation) return
              if (s.format === 'custom') {
                update({ customWMm: s.customHMm, customHMm: s.customWMm })
              } else {
                update({ orientation, format: resolved.sheet.format })
              }
            }}
          />
        </Row>
        <Row label="margin">
          <span className="inline-flex gap-x-[0.6em]">
            <Act active={s.marginMm === 'auto'} onClick={() => update({ marginMm: 'auto' })}>
              auto
            </Act>
            <span>
              <Num
                label="margin"
                max={100}
                muted={s.marginMm === 'auto'}
                value={resolved.marginMm}
                onChange={(marginMm) => update({ marginMm })}
              />
              <Unit />
            </span>
          </span>
        </Row>
        <Row label="gap">
          <Num label="gap" max={100} value={s.gapMm} onChange={(gapMm) => update({ gapMm })} />
          <Unit />
        </Row>
        <Row label="bleed">
          <span className="inline-flex gap-x-[0.6em]">
            <Act active={s.bleedMm === 'auto'} onClick={() => update({ bleedMm: 'auto' })}>
              auto
            </Act>
            <span>
              <Num
                label="bleed"
                max={20}
                muted={s.bleedMm === 'auto'}
                value={resolved.bleedMm}
                onChange={(bleedMm) => update({ bleedMm })}
              />
              <Unit />
            </span>
          </span>
        </Row>
        {info.uniformSize === null && (
          <Row label="sizes">
            <Choice
              value={s.normalizeSizes ? 'align' : 'asIs'}
              options={[
                ['asIs', 'as is'],
                ['align', 'align'],
              ]}
              onChange={(v) => update({ normalizeSizes: v === 'align' })}
            />
          </Row>
        )}
        <Gap />
        <Row label="marks">
          <Toggles
            value={s.marks}
            // Сгиб есть только у брошюры: в остальных схемах границы ячеек режут.
            options={[
              ['crop', 'crop'],
              ...(s.scheme === 'booklet' ? [['fold', 'fold'] as const] : []),
              ['registration', 'registration'],
            ]}
            onChange={(key, on) => update({ marks: { ...s.marks, [key]: on } })}
          />
        </Row>
        {s.marks.crop && fileMarks !== null && (
          <Row>
            <span className="text-mute">
              from file: {mmText(fileMarks.offset)} mm gap, {mmText(fileMarks.length)} mm long
            </span>
          </Row>
        )}
      </div>

      {hasNotes && (
        <div className="mt-[1lh] flex flex-col">
          {built.ok &&
            built.value.warnings.map((w) => (
              <span key={w.kind}>
                {warningText(w)}
                {w.kind === 'MixedPageSizes' && (
                  <>
                    {'  '}
                    <Act onClick={() => update({ normalizeSizes: true })}>
                      <u>align</u>
                    </Act>
                  </>
                )}
              </span>
            ))}
          {built.ok && resolved.scale < 1 && (
            <span>pages scaled to {Math.floor(resolved.scale * 100)}% to fit the sheet</span>
          )}
          {marginTooSmall && (
            <span>
              {marksOn ? 'marks don’t fit in the margin' : 'bleed doesn’t fit in the margin'}
              {'  '}
              <Act onClick={() => update({ marginMm: 'auto' })}>
                <u>auto</u>
              </Act>
            </span>
          )}
        </div>
      )}
      {/* Экспорт — последний шаг после параметров и предупреждений о них. */}
      <div className="mt-[1lh] flex flex-wrap gap-x-[1.2em] whitespace-pre">
        {exporting.kind === 'running' ? (
          <>
            <span>
              exporting {exporting.done} / {exporting.total}
            </span>
            <Act active={false} onClick={onCancel}>
              cancel
            </Act>
          </>
        ) : (
          <Act onClick={onExport} disabled={!built.ok}>
            {exporting.kind === 'failed' ? 'export failed, retry' : 'export'}
          </Act>
        )}
      </div>
    </>
  )

  const footer = (
    <Act active={false} onClick={() => onAbout(!about)}>
      {about ? 'back' : 'about'}
    </Act>
  )

  return (
    <Shell sidebar={about ? <About /> : settings} footer={footer}>
      {built.ok && shown !== undefined ? (
        <Preview
          sheet={shown}
          size={built.value.sheetSize}
          thumbnails={doc.thumbnails}
          handle={doc.handle}
        >
          <nav className="flex gap-x-[1.2em]">
            <Act active={false} disabled={sideIndex === 0} onClick={() => goToSide(sideIndex - 1)}>
              ‹
            </Act>
            <span>
              {sideIndex + 1} / {sideCount}
            </span>
            {sides === 2 && (
              <Act onClick={() => show(current, !back)}>{back ? 'back' : 'front'}</Act>
            )}
            <Act
              active={false}
              disabled={sideIndex >= sideCount - 1}
              onClick={() => goToSide(sideIndex + 1)}
            >
              ›
            </Act>
          </nav>
        </Preview>
      ) : (
        <div className="flex flex-col items-center justify-center text-center">
          {!built.ok && <Problem error={built.error} update={update} />}
        </div>
      )}
    </Shell>
  )
}
