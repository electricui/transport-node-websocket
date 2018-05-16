import sinon from 'sinon'
import chai from 'chai'
import chaiSubset from 'chai-subset'
import chaiAsPromised from 'chai-as-promised'

chai.use(chaiSubset)
chai.use(chaiAsPromised)

const assert = chai.assert

import WebSocket from 'isomorphic-ws'

import WebSocketTransport from '../src/transport'

describe('TransportElectronSerial', () => {
  it('throws when provided with no options', () => {
    assert.throws(() => {
      new WebSocketTransport()
    })
  })

  it('throws when provided with empty options', () => {
    assert.throws(() => {
      new WebSocketTransport({})
    })
  })

  it('the transport read and write works', done => {
    const transport = new WebSocketTransport({
      uri: 'wss://echo.websocket.org/',
      WebSocket: WebSocket
    })

    const spy = sinon.spy()

    const oneToFour = Buffer([0x01, 0x02, 0x03, 0x04])

    transport.interface.on('data', data => {
      console.log(data)

      assert.deepEqual(data, oneToFour)

      transport.disconnect()

      done()
    })

    transport.connect().then(() => {
      transport.interface.write(oneToFour)
    })
  }).timeout(15000)
})
