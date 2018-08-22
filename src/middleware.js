import { SESSION_ADD_DATA, HYPERSESSION_TOGGLE, SESSION_PTY_DATA } from './constants'

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
  if (SESSION_ADD_DATA === action.type) {
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

  next(action)
}
