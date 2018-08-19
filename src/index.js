import React from 'react'
import Component from 'hyper/component'
import gifencoder from 'gifencoder'
import PNG from 'png-js'

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
        const term = this.terms.getActiveTerm();

        term.write('\n\n\r')
        notify('Processing', 'This may take a while...')
      })
      window.rpc.on('record process progress', () => {
        const term = this.terms.getActiveTerm();

        term.write('|')
        //store.dispatch({
        //  type: 'SESSION_USER_DATA',
        //  data: '|',
        //  effect() {
        //    const targetUid = store.getState().sessions.activeUid;
        //    rpc.emit('data', {uid: targetUid, data: '|'})
        //  }
        // })
      })
  
      window.rpc.on('record process done', () => {
        const term = this.terms.getActiveTerm();
      
        term.write('\u001Bc')
        term.write('\n\n\r')

        notify('Done!', 'Gif processed.')
      })
    

      console.log(this.props)
  
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

// Adding Keymaps
module.exports.decorateKeymaps = keymaps => {
  const newKeymaps = {
    'pane:record': 'ctrl+shift+r'
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
      data.push([getDelay(), image])
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
        win.rpc.emit('record process init')

        capture()
        let [w, h] = win.getSize()
        let encoder = new GIFEncoder(2 * w, 2 * h)
        encoder.createReadStream().pipe(fs.createWriteStream(GIF_PATH))
        encoder.start()
        encoder.setRepeat(-1)
        encoder.setQuality(10)

        while (data.length) {
          let [delay, img] = data.shift()
        
          let png = new PNG(img.toPNG());
          await new Promise((resolve, reject) => png.decode((pixels) => {
            encoder.setDelay(delay)
            encoder.addFrame(pixels)
            win.rpc.emit('record process progress')
            resolve()
          }))
        }
        
        win.rpc.emit('record process done')
        encoder.finish() 
      }
    }
  })
  win.rpc.on('data', () => {
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