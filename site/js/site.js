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
;(function () {
  const colors = document.querySelector('.prism .colors')
  if (!colors) return
  requestAnimationFrame(() => setTimeout(() => colors.classList.add('shown'), 50))
})()
