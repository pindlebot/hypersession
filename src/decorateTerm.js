
export default (Term, { React, notify }) => {
  return class extends React.Component {
    constructor (props, context) {
      super(props, context)

      this._canvas = null
      this._processing = null
    }

    processInit = (frames) => {
      this._processing = true
      this._canvas.style.background = this.props.backgroundColor
      this.pos = {}
      this.pos.x = (window.innerWidth - (frames[1] * 8)) / 2
      this.pos.y = (window.innerHeight - 14) / 2
    }

    done = () => {
      this._canvasContext.clearRect(0, 0, this._canvas.width, this._canvas.height)
      notify('Done!', 'Gif processed.')
      this._processing = false
      this._canvas.style.background = 'transparent'
    }

    onDecorated = (term) => {
      this.term = term
      if (this.props.onDecorated) this.props.onDecorated(term)

      window.rpc.on('hypersession process init', this.processInit)
      window.rpc.on('hypersession process progress', this.drawFrame)
      window.rpc.on('hypersession process done', this.done)
      this.initCanvas()
    }

    initCanvas = () => {
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

    resizeCanvas = () => {
      this._canvas.width = window.innerWidth
      this._canvas.height = window.innerHeight
    }

    drawFrame = ([currentFrame, totalFrames]) => {
      this._canvasContext.fillStyle = 'cyan'
      this._canvasContext.fillRect(this.pos.x + (currentFrame * 8), this.pos.y + 4, 4, 14)
    }

    render () {
      return React.createElement(Term, Object.assign({}, this.props, {
        onDecorated: this.onDecorated
      }))
    }

    componentWillUnmount () {
      try {
        document.body.removeChild(this._canvas)
      } catch (err) {
        console.error(err)
      }
      window.removeEventListener('resize', this.resizeCanvas)
      window.rpc.removeListener('hypersession process init', this.processInit)
      window.rpc.removeListener('hypersession process progress', this.drawFrame)
      window.rpc.removeListener('hypersession process done', this.done)
    }
  }
}
