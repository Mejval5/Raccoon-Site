
export default async function () {
  var i
  var id
  var listBg = []
  for (i = 1; i <= 23; i++) {
    id = 'bg' + i
    listBg[i] = document.getElementById(id)
    listBg[i].className += ' mybg'
  }
  var amountX
  var amountY
  var k
  var r = 100
  var angle
  var parallaxAmount = 20
  var currentTimePercent = 1
  var currentTimeDivider
  var desiredAngle
  var currentPosition = [0, 0]
  var startingPosition = [0, 0]
  var desiredPosition
  var startK

  for (k = 1; k <= 200000; k++) {
    if (currentTimePercent > 0.95) {
      currentTimePercent = 0
      startK = k
      currentTimeDivider = 100
      desiredAngle = 2 * Math.PI * Math.random()
      desiredPosition = [Math.cos(desiredAngle) * r, Math.sin(desiredAngle) * r]
      startingPosition = currentPosition
    }
    currentTimePercent = (k - startK) / 100
    currentPosition[0] = startingPosition[0] + (desiredPosition[0] - startingPosition[0]) * currentTimePercent
    currentPosition[1] = startingPosition[1] + (desiredPosition[1] - startingPosition[1]) * currentTimePercent
    console.log(currentTimePercent)

    await new Promise(resolve => setTimeout(resolve, 25))
    for (i = 1; i <= 23; i++) {
      amountX = currentPosition[0]
      amountY = currentPosition[1]
      listBg[i].style.transform = `translate(${amountX}px, ${amountY}px)`
    }
  }

  return {
    name: 'DanParallax',
  }
}
