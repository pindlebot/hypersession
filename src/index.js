import GIFEncoder from 'gifencoder'
import {
  NS_PER_SEC,
  MS_PER_NS,
  HYPERSESSION_RECORD,
  HYPERSESSION_TOGGLE
} from './constants'
import debounce from 'debounce'

export { default as decorateTerm } from './decorateTerm'
export { default as decorateTerms } from './decorateTerms'
export { default as middleware } from './middleware'

let hyperConfig

export const decorateConfig = (config) => {
  hyperConfig = config

  return config
}

export const decorateKeymaps = keymaps => {
  let configKeyMaps = (hyperConfig &&
    hyperConfig.hypersession &&
    hyperConfig.keymaps) || {}

  return {
    ...keymaps,
    [HYPERSESSION_RECORD]: 'ctrl+shift+r',
    ...configKeyMaps
  }
}

const toBitmap = (image) => new Promise((resolve, reject) => {
  setTimeout(() => {
    let bmp = image.toBitmap()
    let arr = new Uint8Array(bmp.length)
    let i = 0

    while (i < bmp.length) {
      arr[i + 0] = bmp[i + 2]
      arr[i + 1] = bmp[i + 1]
      arr[i + 2] = bmp[i + 0]
      arr[i + 3] = bmp[i + 3]
      i += 4
    }

    resolve(arr)
  }, 0)
})

export const onWindow = (win) => {
  const path = require('path')
  const fs = require('fs')
  const HOME = process.platform === 'win32'
    ? process.env.USERPROFILE
    : process.env.HOME

  const GIF_PATH = path.join(HOME, 'Desktop/hyper.gif')
  let script
  if (
    hyperConfig.hypersession &&
    hyperConfig.hypersession.script
  ) {
    let data
    try {
      data = fs.readFileSync(path.resolve(hyperConfig.hypersession.script), { encoding: 'utf8' })
    } catch (err) {
      win.rpc.emit('hypersession log', err)
    }
    script = data.split(/\r?\n/g).filter(l => l !== '')
  }
  let recording = false
  let time
  let frames = []

  const getDelay = () => {
    let diff = process.hrtime(time)
    time = process.hrtime()
    let ms = (diff[0] * NS_PER_SEC + diff[1]) * MS_PER_NS
    return Math.floor(ms)
  }

  const capture = (meta = {}) => new Promise((resolve, reject) =>
    win.capturePage(image => {
      let delay = getDelay()
      frames.push({ delay, image, meta })
      resolve()
    })
  )
  const debounced = debounce(capture, 50)

  win.rpc.on('hypersession clear', async ({ uid }) => {
    recording = true
    time = process.hrtime()
    win.sessions.get(uid).on('data', debounced)
  })

  win.rpc.on('hypersession snapshot', ({ uid }) => {
    debounced()
  })

  win.rpc.on('hypersession toggle', async ({ uid }) => {
    if (!recording) {
      win.rpc.emit('hypersession init', script)
    } else {
      let sess = win.sessions.get(uid)
      if (sess) sess.removeListener('data', debounced)
      await capture()
      recording = false
      win.rpc.emit('hypersession process init', [0, frames.length])
      let [w, h] = win.getSize()
      let encoder = new GIFEncoder(2 * w, 2 * h)
      encoder.createReadStream().pipe(fs.createWriteStream(GIF_PATH))
      encoder.start()
      encoder.setRepeat(-1)
      encoder.setQuality(10)
      let index = 0
      while (index < frames.length) {
        let { delay, image } = frames[index]
        encoder.setDelay(delay)
        let bitmap = await toBitmap(image)
        encoder.addFrame(bitmap)
        win.rpc.emit('hypersession process progress', [index, frames.length])
        index++
      }
      encoder.finish()
      win.rpc.emit('hypersession process done')
      frames = []
    }
  })

  win.rpc.on('data', async ({ data, uid }) => {
    if (!recording) return
    debounced()
  })
}

export const reduceUI = (state, action) => {
  switch (action.type) {
    case HYPERSESSION_TOGGLE:
      return state.set('recording', !state.recording)
  }
  return state
}

export const mapTermsState = (state, map) => {
  return Object.assign(map, {
    recording: state.ui.recording
  })
}

export const getTermProps = (uid, parentProps, props) => {
  return Object.assign(props, {
    recording: parentProps.recording
  })
}
