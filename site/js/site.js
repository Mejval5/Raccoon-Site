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
