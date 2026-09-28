// Starfield: three layers of box-shadow stars drifting upward, same recipe the Vue site built in Sass.
(function () {
  const field = document.querySelector('.stars')
  if (!field) return

  const layer = (count) => {
    const stars = []
    for (let i = 0; i < count; i++) {
      stars.push(`${Math.floor(Math.random() * 2000)}px ${Math.floor(Math.random() * 2000)}px #fff`)
    }
    return stars.join(',')
  }

  const counts = [700, 200, 100]
  field.innerHTML = '<i></i><i></i><i></i>'
  field.querySelectorAll('i').forEach((el, i) => { el.style.boxShadow = layer(counts[i]) })
})()

// Home: sweep the coloured beams in from the corner, once.
// Wait for the menu font (capped, so a slow font server can't stall it) and two painted frames,
// so the sweep never starts while the page is still loading and stutters.
;(function () {
  const colors = document.querySelector('.prism .colors')
  if (!colors) return
  const fontsReady = document.fonts ? document.fonts.ready : Promise.resolve()
  const cap = new Promise(resolve => setTimeout(resolve, 800))
  Promise.race([fontsReady, cap]).then(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => colors.classList.add('shown')))
  })
})()

// Home: show a small peek card to the wedding invitation once the `svatba` cookie is set.
;(function () {
  if (!document.body.classList.contains('home')) return
  const hasInvite = document.cookie.split(';').some((part) => {
    const eq = part.indexOf('=')
    if (eq === -1) return false
    const name = part.slice(0, eq).trim()
    const value = part.slice(eq + 1).trim()
    return name === 'svatba' && value.length > 0
  })
  if (!hasInvite) return

  // Read the wedding page's own chosen-language cookie (set by svatba.js) so
  // this peek card's second line matches whatever language the invitation
  // itself is currently showing.
  const PEEK_TEXT = {
    cs: 'Svatební pozvánka',
    en: 'Wedding invitation',
    fr: 'Faire-part de mariage'
  }
  const langCookie = document.cookie.split(';').reduce((found, part) => {
    if (found) return found
    const eq = part.indexOf('=')
    if (eq === -1) return found
    const name = part.slice(0, eq).trim()
    const value = part.slice(eq + 1).trim()
    return name === 'svatba-lang' ? value : found
  }, null)
  const lang = Object.prototype.hasOwnProperty.call(PEEK_TEXT, langCookie) ? langCookie : 'cs'

  const link = document.createElement('a')
  link.className = 'invite-peek'
  link.href = '/svatba/'
  link.lang = lang
  link.innerHTML = `
    <svg viewBox="0 0 34 34" width="34" height="34" aria-hidden="true" focusable="false">
      <g fill="#fdf6ec">
        <ellipse cx="17" cy="8.5" rx="5" ry="7.5" transform="rotate(0 17 17)"/>
        <ellipse cx="17" cy="8.5" rx="5" ry="7.5" transform="rotate(72 17 17)"/>
        <ellipse cx="17" cy="8.5" rx="5" ry="7.5" transform="rotate(144 17 17)"/>
        <ellipse cx="17" cy="8.5" rx="5" ry="7.5" transform="rotate(216 17 17)"/>
        <ellipse cx="17" cy="8.5" rx="5" ry="7.5" transform="rotate(288 17 17)"/>
      </g>
      <circle cx="17" cy="17" r="4" fill="#f5a55a"/>
    </svg>
    <span class="invite-peek-text">
      <span class="invite-peek-title">Tereza &amp; Daniel · 19. 6. 2027</span>
      <span class="invite-peek-sub">${PEEK_TEXT[lang]}</span>
    </span>`
  document.body.appendChild(link)
  requestAnimationFrame(() => requestAnimationFrame(() => link.classList.add('shown')))
})()

// Fade in page images that haven't loaded yet; cached ones stay as they are, so nothing flickers.
;(function () {
  document.querySelectorAll('.page img').forEach((img) => {
    if (img.complete && img.naturalWidth) return
    img.classList.add('fade-in')
    const show = () => img.classList.add('loaded')
    img.addEventListener('load', show, { once: true })
    img.addEventListener('error', show, { once: true })
  })
})()
