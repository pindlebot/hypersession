const GIFEncoder = require('gifencoder')
const PNG = require('png-js')

const TOGGLE_RECORD = 'TOGGLE_RECORD'

module.exports.decorateTerms = (Terms, { React, notify }) => {
  return class extends React.Component {
    constructor(props, context) {
      super(props, context);
      this.terms = null;
      this.onDecorated = this.onDecorated.bind(this);
    }

    onDecorated(terms) {
      this.terms = terms
      window.rpc.on('record init', () => {
        notify('Recording', 'Recording terminal session.')
      })
      window.rpc.on('record process init', () => {
        notify('Processing', 'This may take a while...')
      })
  
      this.terms.registerCommands({
        'pane:record': e => {
          store.dispatch({
            type: TOGGLE_RECORD,
            effect() {
              rpc.emit('command', TOGGLE_RECORD)
            }
          })
        }
      })
  
      if (this.props.onDecorated) {
        this.props.onDecorated(terms)
      }
    }

    render() {
      return (<Terms onDecorated={this.onDecorated} {...this.props} />)
    }
  }
}

module.exports.decorateKeymaps = keymaps => {
  const newKeymaps = {
    'pane:record': 'ctrl+shift+r'
  }
  return Object.assign({}, keymaps, newKeymaps)
}

module.exports.onWindow = (win) => {
  const path = require('path')
  const fs = require('fs')
  const HOME = process.platform == 'win32'
    ? process.env.USERPROFILE
    : process.env.HOME

  const GIF_PATH = path.join(HOME, 'Desktop/hyper.gif')
  let recording = false
  let skip = false
  let time
  const frames = []
  const NS_PER_SEC = 1e9
  const MS_PER_NS = 1e-6

  const getDelay = () => {
    let diff = process.hrtime(time)
    time = process.hrtime()
    let ms = (diff[0] * NS_PER_SEC + diff[1]) * MS_PER_NS
    return Math.floor(ms)
  }

  const capture = () => {
    win.capturePage(image => {
      let delay = getDelay()
      frames.push([delay, image])
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
        win.rpc.emit('record process init', [0, frames.length])

        capture()
        let [w, h] = win.getSize()
        let encoder = new GIFEncoder(2 * w, 2 * h)
        encoder.createReadStream().pipe(fs.createWriteStream(GIF_PATH))
        encoder.start()
        encoder.setRepeat(-1)
        encoder.setQuality(10)
        let index = 0
        while (index < frames.length) {
          let [delay, img] = frames[index]
          let png = new PNG(img.toPNG());
          await new Promise((resolve, reject) => png.decode((pixels) => {
            encoder.setDelay(delay)
            encoder.addFrame(pixels)
            win.rpc.emit('record process progress', [index, frames.length])
            resolve()
          }))
          index++
        }
       
        win.rpc.emit('record process done')
        encoder.finish() 
      }
    }
  })
  win.rpc.on('data', (data) => {
    if (!recording) return
    capture()
  })
}

module.exports.reduceUI = (state, action) => {
  switch (action.type) {
    case TOGGLE_RECORD:
      return state.set('recording', !state.recording);
  }
  return state;
}

module.exports.mapTermsState = (state, map) => {
  return Object.assign(map, {
    recording: state.ui.recording
  })
}

module.exports.getTermProps = (uid, parentProps, props) => {
  return Object.assign(props, {
    recording: parentProps.recording
  })
}

module.exports.decorateTerm = (Term, { React, notify }) => {
  return class extends React.Component {
    constructor (props, context) {
      super(props, context)

      this.drawFrame = this.drawFrame.bind(this);
      this.resizeCanvas = this.resizeCanvas.bind(this);
      this.onDecorated = this.onDecorated.bind(this);
      this.onCursorMove = this.onCursorMove.bind(this);
     
      this._div = null;
      this._canvas = null;
    }

    onDecorated (term) {
      if (this.props.onDecorated) this.props.onDecorated(term)
      window.rpc.on('record process init', (frames) => {
        term.write('\r\n')
      })
      window.rpc.on('record process progress', (progress) => {
        this.drawFrame(progress)
      })
      window.rpc.on('record process done', () => {
         this._canvasContext.clearRect(0, 0, this._canvas.width, this._canvas.height)
         document.body.removeChild(this._canvas)
         notify('Done!', 'Gif processed.')
      })
      this._div = term.termRef;
      this.initCanvas()
    }

    // Set up our canvas element we'll use to do particle effects on.
    initCanvas () {
      this._canvas = document.createElement('canvas')
      this._canvas.style.position = 'absolute'
      this._canvas.style.top = '0'
      this._canvas.style.pointerEvents = 'none'
      this._canvasContext = this._canvas.getContext('2d')
      this._canvas.width = window.innerWidth
      this._canvas.height = window.innerHeight
      document.body.appendChild(this._canvas)
      window.addEventListener('resize', this.resizeCanvas)
    }

    resizeCanvas () {
      this._canvas.width = window.innerWidth
      this._canvas.height = window.innerHeight
    }

    // Draw the next frame in the particle simulation.
    drawFrame ([currentFrame, totalFrames]) {
      this._canvasContext.fillStyle = `cyan`;
      this._canvasContext.fillRect(this.pos.x + (currentFrame * 4), this.pos.y + 2, 2, 10);
    }
  
    onCursorMove (cursorFrame) {
      if (this.props.onCursorMove) {
        this.props.onCursorMove(cursorFrame)
      }
      const { x, y } = cursorFrame
      const origin = this._div.getBoundingClientRect()
      this.pos = {
        x: x + origin.left,
        y: y + origin.top
      }
    }
 
    render () {
      return React.createElement(Term, Object.assign({}, this.props, {
        onDecorated: this.onDecorated,
        onCursorMove: this.onCursorMove
      }))
    }

    componentWillUnmount () {
      document.body.removeChild(this._canvas)
    }
  }
}