
import * as noise from '@/plugins/perlin.js'

export default function () {
  return {
    name: 'DanParallax',

    methods: {
      debug: false,
      stop: false,
      pause: false,
      async run () {
        var i
        var id
        var listBg = []
        for (i = 1; i <= 22; i++) {
          id = 'bg' + i
          listBg[i] = document.getElementById(id)
          listBg[i].className += ' mybg'
        }
        var amountX
        var amountY
        var k
        var _i
        var defR = 200
        var r
        var angle
        var parallaxAmount = 500
        var perlinNoise
        var perlinNoiseR

        for (k = 1; k <= 200000; k++) {
          if (this.stop) {
            return
          }
          if (this.pause) {
            await new Promise(resolve => setTimeout(resolve, 200))
            k -= 1
            continue
          }
          perlinNoise = noise.noise.perlin2(k / 1000, k / 1000)
          perlinNoiseR = noise.noise.perlin2(k / 1000, k / 1000)
          if (this.debug) {
            console.log(perlinNoise)
          }
          angle = (k / 500 % 2 * Math.PI) + perlinNoise * Math.PI * 2
          r = perlinNoiseR * defR
          await new Promise(resolve => setTimeout(resolve, 50))
          for (i = 1; i <= 22; i++) {
            if (i >= 20 && i <= 22) {
              _i = 20
            } else if (i === 23) {
              _i = 18
            } else {
              _i = i
            }

            amountX = Math.cos(angle) * r * _i * _i / parallaxAmount
            amountY = Math.sin(angle) * r * _i * _i / parallaxAmount
            listBg[i].style.transform = `translate(${amountX}px, ${amountY}px)`
          }
        }
      },
      is_running () {
        console.log(this)
        return this.running
      },
    },
  }
}
