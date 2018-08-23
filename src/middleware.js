import {
  SESSION_ADD_DATA,
  HYPERSESSION_TOGGLE,
  SESSION_PTY_DATA,
  HYPERSESSION_SNAPSHOT
} from './constants'

function detectRecordCommand (data) {
  const patterns = [
    'record: command not found',
    'command not found: record',
    'Unknown command \'record\'',
    '\'record\' is not recognized.*'
  ]
  return new RegExp('(' + patterns.join(')|(') + ')').test(data)
}

export default (store) => (next) => (action) => {
  if (action.type === SESSION_ADD_DATA) {
    const { data } = action
    if (detectRecordCommand(data)) {
      return store.dispatch({
        type: HYPERSESSION_TOGGLE,
        effect () {
          const uid = store.getState().sessions.activeUid
          window.rpc.emit('hypersession toggle', { command: HYPERSESSION_TOGGLE, uid })
        }
      })
    }
  }
  if (action.type === SESSION_PTY_DATA) {
    let state = store.getState()
    if (state.ui.recording) {
      return store.dispatch({
        type: HYPERSESSION_SNAPSHOT,
        effect () {
          const uid = store.getState().sessions.activeUid
          window.rpc.emit('hypersession snapshot', { command: HYPERSESSION_SNAPSHOT, uid })
          next(action)
        }
      })
    }
  }

  next(action)
}
