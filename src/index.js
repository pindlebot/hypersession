const GIFEncoder = require('gifencoder');
const PNG = require('png-js')

const TOGGLE_RECORD = 'TOGGLE_RECORD'

export function execCommand(command, fn, e) {
  return (dispatch, getState) =>
    dispatch({
      type: 'UI_COMMAND_EXEC',
      command,
      effect() {
        rpc.emit('command', command);
      }
    })
}

module.exports.decorateTerms = (Terms, { React, notify }) => {
  return class extends React.Component {
    constructor(props, context) {
      super(props, context);
      this.terms = null;
      this.onDecorated = this.onDecorated.bind(this);
    }
  
    onDecorated(terms) {
      window.rpc.on('record init', () => {
        notify('Recording', 'Recording terminal session.')
      })
      window.rpc.on('record process init', () => {
        notify('Processing', 'This may take a while...')
      })
      window.rpc.on('record process done', () => {
        notify('Done!', 'Gif processed.')
      })
  
      this.terms = terms;
      this.terms.registerCommands({
        'pane:screenshot': e => {
          store.dispatch(execCommand(TOGGLE_RECORD))
        }
      })
      // Don't forget to propagate it to HOC chain
      if (this.props.onDecorated) this.props.onDecorated(terms);
    }

    render() {
      return (<Terms onDecorated={this.onDecorated} {...this.props} />)
    }
  }
}

// Adding Keymaps
module.exports.decorateKeymaps = keymaps => {
  const newKeymaps = {
    'pane:screenshot': 'ctrl+shift+s'
  }
  return Object.assign({}, keymaps, newKeymaps)
}

module.exports.onWindow = (win) => {
  const HOME = process.platform == 'win32'
    ? process.env.USERPROFILE
    : process.env.HOME

  const path = require('path')
  const fs = require('fs')
  const GIF_PATH = path.join(HOME, 'Desktop/hyper.gif')
  let recording = false
  let skip = false
  let time
  const data = []

  const getDelay = () => {
    let diff = process.hrtime(time)
    time = process.hrtime()
    return Math.floor(diff[1] / 1e6)
  }

  const capture = () => {
    win.capturePage(image => {

      let delay = getDelay()
      if (delay < 50) {
        if (!skip) {
          skip = true
          return
        }
      }
      skip = false
      data.push([getDelay(), image.toPNG()])
    })
  }
  win.rpc.on('command', async (command) => {
    if (command === TOGGLE_RECORD) {
      if (!recording) {
        recording = true
        win.rpc.emit('record init')
        time = process.hrtime()
      } else {
        recording = false
        capture()
        win.rpc.emit('record process init')
        let [w, h] = win.getSize()
        let encoder = new GIFEncoder(2 * w, 2 * h)
        encoder.createReadStream().pipe(fs.createWriteStream(GIF_PATH))
        encoder.start()
        encoder.setRepeat(-1)
        encoder.setQuality(10)

        while (data.length) {
          let [delay, buffer] = data.shift()
        
          let png = new PNG(buffer);
          await new Promise((resolve, reject) => png.decode((pixels) => {
            encoder.setDelay(delay)
            encoder.addFrame(pixels)
            resolve()
          }))
        }
        
        win.rpc.emit('record process done')
        encoder.finish()
        
        return
      }
    
      //interval = setInterval(() => {
      //  if (!recording) {
      //    return
      //  }
      //  win.capturePage(image => {
      //    let buffer = image.toPNG()
      //    const used = process.memoryUsage().heapUsed / 1024 / 1024
      //    win.rpc.emit('memory', `${Math.round(used * 100) / 100} MB`)
      //    buffers.push(buffer)
      //  })
      //}, 50)
    }
  })
  win.rpc.on('data', () => {
    if (!recording) return
    capture()
  })
}

// export function mapHyperDispatch(dispatch, map) {
//  console.log({ dispatch, map })
//  return map
//}

module.exports.middleware = (store) => {
  return (next) => (action) => {
    // console.log(action)
    // console.log({ store, next, action })
    next(action)
  }
}