type Link = { readonly text: string; readonly href: string }
/** Строка: подпись, одна или несколько ссылок и серая приписка. */
type Line = { readonly label: string; readonly links: readonly Link[]; readonly note?: string }

const one = (label: string, text: string, href: string): Line => ({
  label,
  links: [{ text, href }],
})

/** Автор и контакты. Ссылка на исходники обязательна: AGPL требует её у размещённой копии. */
const AUTHOR: readonly Line[] = [
  one('author', 'Anton Volnenko', 'https://github.com/antons0vv'),
  one('email', 'antons0vv@gmail.com', 'mailto:antons0vv@gmail.com'),
  {
    label: 'social',
    links: [
      { text: 'telegram', href: 'https://t.me/antons_vv' },
      { text: 'instagram', href: 'https://instagram.com/antons_vv' },
    ],
    note: '@antons_vv',
  },
  one('source', 'github.com/antons0vv/spusk', 'https://github.com/antons0vv/spusk'),
]

/** Чужой код и шрифт, чьи лицензии просят упоминания. */
const CREDITS: readonly Line[] = [
  one('license', 'AGPL-3.0-or-later', 'https://www.gnu.org/licenses/agpl-3.0.html'),
  one('engine', 'MuPDF by Artifex Software', 'https://mupdf.com'),
  one('typeface', 'Alice by Cyreal', 'https://github.com/cyrealtype/Alice'),
]

const Lines = ({ lines }: { lines: readonly Line[] }) => (
  <div className="grid grid-cols-[4.6em_minmax(0,1fr)] gap-x-[1em]">
    {lines.map((line) => (
      <div key={line.label} className="contents">
        <span className="text-mute">{line.label}</span>
        <span className="inline-flex flex-wrap gap-x-[0.6em]">
          {line.links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target={link.href.startsWith('mailto:') ? undefined : '_blank'}
              rel="noreferrer"
              className="hover:underline"
            >
              {link.text}
            </a>
          ))}
          {line.note !== undefined && <span className="text-mute">{line.note}</span>}
        </span>
      </div>
    ))}
  </div>
)

/** Что это и чьё: на пустом экране стоит в боковой колонке, на рабочем открывается по «about». */
export const About = () => (
  <div className="flex flex-col gap-y-[1lh]">
    <div>
      <p>spusk</p>
      <p>
        imposition for print, right in the browser. files are processed on your computer and never
        uploaded anywhere.
      </p>
    </div>
    <Lines lines={AUTHOR} />
    <Lines lines={CREDITS} />
  </div>
)
