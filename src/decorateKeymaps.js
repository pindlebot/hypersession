import { PANE_RECORD } from './constants'

export default keymaps => {
  const newKeymaps = {
    [PANE_RECORD]: 'ctrl+shift+r'
  }
  return Object.assign({}, keymaps, newKeymaps)
}
