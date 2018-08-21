const PNG = require('png-js')
const GIFEncoder = require('gifencoder')
import {
  NS_PER_SEC,
  MS_PER_NS,
  PANE_RECORD,
  SESSION_ADD_DATA,
  SESSION_USER_DATA,
  HYPERSESSION_CLEAR,
  HYPERSESSION_TOGGLE
} from './constants'

export { default as decorateKeymaps } from './decorateKeymaps'
export { default as decorateTerm } from './decorateTerm'
export { default as decorateTerms } from './decorateTerms'
export { default as middleware } from './middleware'

let hyperConfig

export const decorateConfig = (config) => {
  hyperConfig = config

  return config
}

export const onWindow = (win) => {
  const path = require('path')
  const fs = require('fs')
  const HOME = process.platform === 'win32'
    ? process.env.USERPROFILE
    : process.env.HOME

  const GIF_PATH = path.join(HOME, 'Desktop/hyper.gif')
  let script
  if (hyperConfig.hypersession && hyperConfig.hypersession.script) {
    let data
    try {
      data = fs.readFileSync(path.resolve(hyperConfig.hypersession.script), { encoding: 'utf8' })
    } catch (err) {
      win.rpc.emit('record log', err)
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
      frames.push({ delay, image, meta})
      resolve()
    })
  )
  win.rpc.on('hypersession clear', async ({ uid }) => {
    recording = true
    time = process.hrtime()
  })

  win.rpc.on('hypersession toggle', async ({ uid }) => {
    if (!recording) {
      win.rpc.emit('hypersession init', script)
    } else {
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
        let png = new PNG(image.toPNG())
        await new Promise((resolve, reject) => png.decode((pixels) => {
          encoder.setDelay(delay)
          encoder.addFrame(pixels)
          win.rpc.emit('hypersession process progress', [index, frames.length])
          resolve()
        }))
        index++
      }
      encoder.finish()
      win.rpc.emit('hypersession process done')
      frames = []
    }
  })

  win.rpc.on('data', async ({ data, uid }) => {
    if (!recording) return
    // if (/^record$/.test(history.data)) {
    //  frames = frames.slice(0, history.frame)
    //  return
    // }

    // if (data.charCodeAt(0) === 13) {
    //  history.data = ''
    //  history.frame = frames.length + 3
    //  win.sessions.get(uid).once('data', data => {
    //    setTimeout(() => capture(), 50)
    //  })
    // } else {
    //  history.data += data
    // }

    await capture()
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
