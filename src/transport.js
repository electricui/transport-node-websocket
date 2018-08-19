import { Duplex, PassThrough } from 'stream'

const debug = require('debug')('electricui-transport-node-websocket:transport')

const convertWSToStream = socket => {
  function write(chunk, enc, cb) {
    if (socket.readyState === socket.OPEN) {
      socket.send(chunk, cb)
    } else {
      socket.once('open', ignore => write(chunk, enc, cb))
    }
  }

  const stream = new Duplex({
    read: size => {},
    write: write,
    final: cb => cb(),
  })

  socket.on('message', chunk => stream.push(chunk))

  // TODO: catch errors

  return stream
}

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

  connect = () => {
    return new Promise((resolve, reject) => {
      debug('Websocket connected')

      const wsClass = this.WebSocket

      this.socket = new wsClass(this.uri, this.options)
      this.wsInterface = convertWSToStream(this.socket)

      // pipe through the PassThrough
      this.wsInterface.pipe(this.readInterface)
      this.writeInterface.pipe(this.wsInterface)

      this.socket.once('open', () => {
        resolve()
      })
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
}

export default WebSocketTransport
