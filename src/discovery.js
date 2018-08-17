import {
  MESSAGEID_SEARCH,
  TYPE_CALLBACK,
  TYPE_QUERY,
} from '@electricui/protocol-constants'

import { PassThrough } from 'stream'

class WebSocketDiscovery {
  constructor(opts) {
    const { factory, configuration = {} } = opts

    if (factory === undefined || factory === null) {
      throw new TypeError('no factory provided')
    }

    this.factory = factory
    this.configuration = configuration

    this.transportKey = 'websocket'
    this.canAcceptConnectionHints = true

    this.eventInterface = new PassThrough({ objectMode: true })

    /*
      The configuration object contains:
      {
        uri: 'ws://host:port'
      }
    */
  }

  validateAvailabilityHint = async (
    callback,
    generateTransportHash,
    isConnected,
    setConnected,
    ephemeralConnectionHinter,
    hint,
  ) => {
    const connectionOptions = {}

    console.log(`Validating the discovery from hint ${JSON.stringify(hint)}`)

    if (hint.uri) {
      connectionOptions.uri = hint.uri
    } else {
      return
    }

    // make sure we're not already connected
    const connectedAlready = isConnected(this.transportKey, connectionOptions)

    if (connectedAlready) {
      return // bail, we're already connected to this path
    }

    // we then generate a transport instance based on the merged configuration and dynamic options (eg the comPath / URI / filePath)
    const { transport, readInterface, writeInterface } = this.factory(
      Object.assign({}, this.configuration, connectionOptions),
    )

    // use the interfaces above to connect and do the needful
    setConnected(this.transportKey, connectionOptions, true)

    await transport.connect()

    // waitForReply implementation

    let cacheInternal = {}
    let cacheDeveloper = {}
    let subscriptions = {}

    const incomingData = packet => {
      if (packet.internal) {
        cacheInternal[packet.messageID] = packet.payload
      } else {
        cacheDeveloper[packet.messageID] = packet.payload
      }

      const cb = subscriptions[packet.messageID]

      if (cb) {
        cb(packet.payload)
      }
    }

    const createWaitForReply = messageID => {
      return new Promise((res, rej) => {
        subscriptions[messageID] = res
      })
    }

    readInterface.on('data', incomingData)

    writeInterface.write({
      messageID: MESSAGEID_SEARCH,
      type: TYPE_CALLBACK,
      internal: true,
    })

    // we should recieve: lv, bi, si in that order

    await createWaitForReply('si')

    const { bi, ...restCacheInternal } = cacheInternal

    readInterface.removeListener('data', incomingData)
    transport.disconnect()
    setConnected(this.transportKey, connectionOptions, false)

    // get some device information
    const deviceInformation = {
      deviceID: bi, // this is always expected
      internal: {
        ...restCacheInternal,
      },
      developer: {
        // this can be injected if the developer wants
        ...cacheDeveloper,
      },
      transportKey: this.transportKey,
      connectionOptions: connectionOptions,
    }

    // bubble this method up as a potential connection method
    callback({
      transportKey: this.transportKey,
      connectionOptions,
      deviceInformation,
    })
  }

  startDiscovery = () => {}

  stopDiscovery = () => {}
}

export default WebSocketDiscovery
