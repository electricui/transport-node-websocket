import { Duplex, PassThrough } from 'stream'

const debug = require('debug')('electricui-transport-node-websocket:transport')

class WebSocketTransport {
  constructor(options = {}) {
    if (options.uri === undefined || options.uri === null) {
      throw new TypeError('no uri provided')
    }

    if (options.WebSocket === undefined || options.WebSocket === null) {
      throw new TypeError('You must provide a WebSocket class')
    }

    const { uri, ...rest } = options

    this.options = { ...rest }

    this.uri = uri

    this.WebSocket = options.WebSocket

    this.readInterface = new PassThrough({ objectMode: false })
    this.writeInterface = new PassThrough({ objectMode: false })
  }

  convertWSToStream = (socket, onopen) => {
    const preConnectionQueue = []

    function write(chunk, enc, cb) {
      if (socket.readyState === socket.OPEN) {
        socket.send(chunk, cb)
      } else {
        preConnectionQueue.push({ chunk, enc, cb })
      }
    }

    const stream = new Duplex({
      read: size => {},
      write: write,
      final: cb => cb(),
    })

    socket.onmessage = chunk => {
      const buffer = Buffer.from(chunk.data)
      stream.push(buffer)
    }
    socket.onerror = this.error
    socket.onopen = () => {
      for (const preOpenWrite of preConnectionQueue) {
        const { chunk, enc, cb } = preOpenWrite
        write(chunk, enc, cb)
      }

      onopen()
    }

    stream.on('error', this.error)

    return stream
  }

  connect = () => {
    return new Promise((resolve, reject) => {
      debug('Websocket connected')

      const wsClass = this.WebSocket

      this.socket = new wsClass(this.uri) // ws has no options to pass.
      this.socket.binaryType = 'arraybuffer'
      this.wsInterface = this.convertWSToStream(this.socket, resolve)

      // pipe through the PassThrough
      this.wsInterface.pipe(this.readInterface)
      this.writeInterface.pipe(this.wsInterface)
    })
  }

  disconnect = () => {
    return new Promise((resolve, reject) => {
      debug('Websocket disconnect')

      // clean up
      if (this.wsInterface) this.wsInterface.unpipe(this.readInterface)
      if (this.writeInterface) this.writeInterface.unpipe(this.wsInterface)

      this.socket.close()

      resolve()
    })
  }

  error = e => {
    debugger
    this.disconnect()
    console.error(e)
  }
}

export default WebSocketTransport
