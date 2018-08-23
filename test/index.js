let index = 0
let interval

interval = setInterval(() => {
  console.log(index)
  if (index > 10) {
    clearInterval(interval)
  }
  index++
}, 500)
