const GIFEncoder = require('gifencoder')
const PNG = require('png-js')
const debounce = require('debounce')
const TOGGLE_RECORD = 'TOGGLE_RECORD'
const TERM_CLEARED = 'TERM_CLEARED'

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
        const term = this.terms.getActiveTerm()
        term.clear()
        notify('Recording', 'Recording terminal session.')
        store.dispatch({
          type: TERM_CLEARED,
          effect() {
            rpc.emit('command', TERM_CLEARED)
          }
        })
      })
      window.rpc.on('record process init', () => {
        notify('Processing', 'This may take a while...')
      })
      window.rpc.on('record log', console.log.bind(console))
  
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
  let time
  let frames = []
  let history = {
    data: ''
  }
  const NS_PER_SEC = 1e9
  const MS_PER_NS = 1e-6

  const getDelay = () => {
    let diff = process.hrtime(time)
    time = process.hrtime()
    let ms = (diff[0] * NS_PER_SEC + diff[1]) * MS_PER_NS
    return Math.floor(ms)
  }

  const capture = (meta = {}) => win.capturePage(image => {
    let delay = getDelay()
    frames.push({ delay, image, meta})
  })

  const debounced = debounce(capture, 100)
 
  win.rpc.on('command', async (command) => {
    if (command === TERM_CLEARED) {
      recording = true
      time = process.hrtime()
    }
    
    if (command === TOGGLE_RECORD) {
      if (!recording) {
        win.rpc.emit('record init')
      } else {
        recording = false
        win.rpc.emit('record process init', [0, frames.length])

        let [w, h] = win.getSize()
        let encoder = new GIFEncoder(2 * w, 2 * h)
        encoder.createReadStream().pipe(fs.createWriteStream(GIF_PATH))
        encoder.start()
        encoder.setRepeat(-1)
        encoder.setQuality(10)
        let index = 0
        while (index < frames.length) {
          let {delay, image} = frames[index]
          let png = new PNG(image.toPNG());
          await new Promise((resolve, reject) => png.decode((pixels) => {
            encoder.setDelay(delay)
            encoder.addFrame(pixels)
            win.rpc.emit('record process progress', [index, frames.length])
            resolve()
          }))
          index++
        }
        encoder.finish()
        win.rpc.emit('record process done')
        frames = []
        history = {
          data: ''
        }
      }
    }
  })
  
  win.rpc.on('data', ({ data, uid }) => {    
    if (!recording) return
  
    if (/^record$/.test(history.data)) {
      frames = frames.slice(0, history.frame)
      return
    }

    if (data.charCodeAt(0) === 13) {
      history.data = ''
      history.frame = frames.length + 3
      win.sessions.get(uid).once('data', data => {
        setTimeout(() => capture(), 50)
      })
    } else {
      history.data += data
    }

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

      this.drawFrame = this.drawFrame.bind(this)
      this.resizeCanvas = this.resizeCanvas.bind(this)
      this.onDecorated = this.onDecorated.bind(this)
     
      this._canvas = null
      this._processing = null;
    }

    onDecorated (term) {
      if (this.props.onDecorated) this.props.onDecorated(term)
      window.rpc.on('record process init', (frames) => {
        this._processing = true
        this._canvas.style.background = this.props.backgroundColor
        this.pos = {}
        this.pos.x = (window.innerWidth - (frames[1] * 8)) / 2
        this.pos.y = (window.innerHeight - 14) / 2
      })
      window.rpc.on('record process progress', (progress) => {
        this.drawFrame(progress)
      })
      window.rpc.on('record process done', () => {
         this._canvasContext.clearRect(0, 0, this._canvas.width, this._canvas.height)
         notify('Done!', 'Gif processed.')
         this._processing = false
         this._canvas.style.background = 'transparent'
      })
      this._div = term.termRef;
      this.initCanvas()
    }

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

    drawFrame ([currentFrame, totalFrames]) {
      this._canvasContext.fillStyle = `cyan`;
      this._canvasContext.fillRect(this.pos.x + (currentFrame * 8), this.pos.y + 4, 4, 14);
    }
  
    render () {
      return React.createElement(Term, Object.assign({}, this.props, {
        onDecorated: this.onDecorated
      }))
    }

    componentWillUnmount () {
      document.body.removeChild(this._canvas)
    }
  }
}


exports.middleware = (store) => (next) => (action) => {
  if ('SESSION_ADD_DATA' === action.type) {
		    const { data } = action
    if (detectRecordCommand(data)) {
      return store.dispatch({
        type: TOGGLE_RECORD,
        effect() {
          rpc.emit('command', TOGGLE_RECORD)
        }
      })
    }
  }

  next(action)
}

function detectRecordCommand(data) {
  const patterns = [
    'record: command not found',
    'command not found: record',
    'Unknown command \'record\'',
    '\'record\' is not recognized.*'
  ];
  return new RegExp('(' + patterns.join(')|(') + ')').test(data)
}