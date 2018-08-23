import {
  SESSION_USER_DATA,
  HYPERSESSION_CLEAR,
  HYPERSESSION_TOGGLE,
  HYPERSESSION_RECORD
} from './constants'

function sendSessionData (data) {
  return (dispatch, getState) => {
    dispatch({
      type: SESSION_USER_DATA,
      data,
      effect () {
        // If no uid is passed, data is sent to the active session.
        const uid = getState().sessions.activeUid

        window.rpc.emit('data', { uid, data })
      }
    })
  }
}

export default (Terms, { React, notify }) => {
  return class extends React.Component {
    constructor (props, context) {
      super(props, context)
      this.terms = null
    }

    done = () => {
      notify('Done!', 'Gif processed.')
      console.timeEnd('processing')
    }

    init = async (script) => {
      const term = this.terms.getActiveTerm()
      term.clear()
      notify('Recording', 'Recording terminal session.')
      window.store.dispatch({
        type: HYPERSESSION_CLEAR,
        effect () {
          const uid = window.store.getState().sessions.activeUid
          window.rpc.emit('hypersession clear', { command: HYPERSESSION_CLEAR, uid })
        }
      })
      if (script) {
        while (script.length) {
          let line = script.shift()
          let chars = line.split('')
          chars.push('\n')
          while (chars.length) {
            await new Promise((resolve, reject) => setTimeout(() => {
              window.store.dispatch(sendSessionData(chars.shift()))
              resolve()
            }, 200))
          }
        }
      }
    }

    process = () => {
      console.time('processing')
      // notify('Processing', 'This may take a while...')
    }

    onDecorated = (terms) => {
      this.terms = terms
      window.rpc.on('hypersession init', this.init)
      window.rpc.on('hypersession process init', this.process)
      window.rpc.on('hypersession log', console.log.bind(console))
      window.rpc.on('hypersession process done', this.done)
      window.rpc.on('hypersession process progress', (data) => {
        console.log('progress', data)
      })
      this.terms.registerCommands({
        [HYPERSESSION_RECORD]: e => {
          window.store.dispatch({
            type: HYPERSESSION_TOGGLE,
            effect () {
              const uid = window.store.getState().sessions.activeUid
              window.rpc.emit('hypersession toggle', { command: HYPERSESSION_TOGGLE, uid })
            }
          })
        }
      })

      if (this.props.onDecorated) {
        this.props.onDecorated(terms)
      }
    }

    componentWillUnmount () {
      window.rpc.removeListener('hypersession init', this.init)
      window.rpc.removeListener('hypersession process init', this.process)
      window.rpc.removeListener('hypersession process done', this.done)
    }

    render () {
      return (<Terms onDecorated={this.onDecorated} {...this.props} />)
    }
  }
}