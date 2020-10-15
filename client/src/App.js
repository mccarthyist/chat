import React, { useState, Component } from 'react'
import styled from 'styled-components'
import Peer from 'simple-peer'
import * as openpgp from 'openpgp'
import SocketContext from './SocketContext'

const defaultUser = { name: 'Jon Smith', email: 'jon@example.com' }
const defaultECCCurve = 'ed25519'
const defaultPassphrase = 'ThisNeedsToBeChanged'

const Background = styled.div`
  position: fixed;
  overflow: auto;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: #ccdfff;
`

const Container = styled.div`
  padding: 20px;
`

const Topbar = styled.div`
  text-align: center;
`

const Title = styled.div`
  font-size: 3rem;
`

const FormContainer = styled.div`
  display: flex;
`

const keygen = async () => {
  const result = await openpgp.generateKey({
    userIds: [defaultUser],
    curve: defaultECCCurve,
    passphrase: defaultPassphrase
  })

  return result
}

const decodeIncomingData = (data) => {
  if (typeof data === 'string') {
    return data
  } else {
    return new TextDecoder('utf-8').decode(data)
  }
}

const JoiningRoom = () => {
  return <div>Joining room</div>
}

const RoomForm = ({ handleCreateRoom, handleJoinRoom }) => {
  const [createRoomName, setCreateRoomName] = useState('')
  const [joinRoomName, setJoinRoomName] = useState('')
  const [userName, setUserName] = useState('')

  const handleSubmitCreateRoom = (event) => {
    event.preventDefault()
    handleCreateRoom(createRoomName, userName)
  }

  const handleSubmitJoinRoom = (event) => {
    event.preventDefault()
    handleJoinRoom(joinRoomName, userName)
  }

  return (
    <FormContainer>
      <div>
        <div>
          USER NAME
        </div>
        <input onChange={(e) => setUserName(e.target.value)} />
      </div>
      <div>
        <div>
          CREATE ROOM
        </div>
        <form onSubmit={(e) => handleSubmitCreateRoom(e)}>
          <input onChange={(e) => setCreateRoomName(e.target.value)} />
        </form>
      </div>
      <div>
        <div>
          JOIN ROOM
        </div>
        <form onSubmit={(e) => handleSubmitJoinRoom(e)}>
          <input onChange={(e) => setJoinRoomName(e.target.value)} />
        </form>
      </div>
    </FormContainer>
  )
}

const ChatBox = ({ chats, handleSendChat }) => {
  const [chatText, setChatText] = useState('')

  const handleSubmitChat = (event) => {
    event.preventDefault()
    handleSendChat(chatText)
    setChatText('')
  }

  return (
    <div>
      {chats.map((chat, i) => (
        <div key={i}>
          <hr />
          <div style={{ display: 'inline-block' }}>
            {chat.from}: {chat.text}
          </div>
        </div>
      ))}
      <form onSubmit={(e) => handleSubmitChat(e)}>
        <input value={chatText} onChange={(e) => setChatText(e.target.value)} />
      </form>
    </div>
  )
}

class App extends Component {
  state = {
    state: 'start',
    peers: [],
    chats: [],
    roomId: '',
    userId: '',
    userName: '',
    publicKey: '',
    privateKey: '',
    otherPubKey: ''
  }

  onSendChat = async (chatText) => {
    const start = Date.now()

    const message = { from: this.state.userName, text: chatText }
    this.setState({ chats: [...this.state.chats, message] })

    const { data: encrypted } = await openpgp.encrypt({
      message: openpgp.message.fromText(JSON.stringify(message)),
      publicKeys: (await openpgp.key.readArmored(this.state.otherPubKey)).keys
    })

    this.state.peerObj.send(encrypted)
  }

  handleIncomingData = async (data) => {
    const result = decodeIncomingData(data)

    if (!this.state.otherPubKey) {
      this.setState({ otherPubKey: result })
    } else {
      const { keys: [privKey] } = await openpgp.key.readArmored(this.state.privateKey);
      await privKey.decrypt(defaultPassphrase);

      const { data: decrypted } = await openpgp.decrypt({
        message: await openpgp.message.readArmored(result),
        privateKeys: [privKey]
      })

      const parsed = JSON.parse(decrypted)
      const message = { from: parsed.from, text: parsed.text }
      this.setState({ chats: [...this.state.chats, message] })
    }
  }

  onConnected = async (peer) => {
    // this.setState({ peerObj: peer })

    // peer.on('error', err => console.error('connected-error', err))
    // peer.on('data', data => this.handleIncomingData(data))

    // const { privateKeyArmored, publicKeyArmored, revocationCertificate } = await keygen()
    // this.setState({ publicKey: publicKeyArmored, privateKey: privateKeyArmored })

    // peer.send(publicKeyArmored)
  }

  onCreateRoom = (roomName, userName) => {
    this.setState({ userName })

    // const peer = new Peer({
    //   initiator: true,
    //   trickle: false
    // })

    // peer.on('error', err => console.error('peer-init-error', err))

    // peer.on('signal', data => {
    //   // created automatically by the peer since initiator is true
    //   // send offer to server
    //   this.props.socket.emit('create-room', { name: roomName, initiator: data })
    //   this.setState({ state: 'room' })
    // })

    // peer.on('connect', () => {
    //   console.log(`Host Connected on: ${Date.now()}`)
    //   this.onConnected(peer)
    // })

    this.props.socket.on('failed-create', data => {
      alert(`failed to create room ${roomName}`)
    })

    // TODO: allow userId to come from app,
    // or gen a new one each time?
    this.props.socket.on('room-created', socketData => {
      console.log(socketData.roomId, socketData.userId)
      this.setState({ state: 'room', userId: socketData.userId, roomId: socketData.roomId }, this.onJoinRoom(socketData.roomId, userName, true))
    })

    this.props.socket.emit('create-room', { name: roomName })
  }

  // creator -> socket 'create-room'
  // server -> creator -> socket 'room-created' or 'failed-create'

  // joiner -> socket 'join-room'
  // server -> joiner -> socket 'present-list'
  // server -> present(s) -> socket 'user-joining'

  // everyone in room -> socket 'offer'


  onJoinRoom = (roomId, userName, first = false) => {
    this.props.socket.on('present-list', socketData => {
      // set up the initial peers here
      const peers = socketData.list.map(item => {
        const peer = new Peer({
          initiator: false,
          trickle: false
        })

        peer.on('signal', data => {
          console.log('got signal?', data)
          // emit answer
          this.props.socket.emit('answer', {
            roomId,
            answer: data,
            answerFrom: this.state.userId,
            answerTo: item.id
          })
        })

        peer.on('connect', data => { console.log('starting connected!!!', data) })

        return { peerObj: peer, id: item.id }
      })

      this.setState({
        roomId,
        peers,
        state: 'joining',
        userId: socketData.userId
      })
    })

    this.props.socket.on('offer', socketData => {
      console.log('offer', socketData.offerFrom, this.state.userId)
      const { offerFrom, initiator } = socketData

      const offerFromPeer = this.state.peers.find(peer => offerFrom === peer.id)

      console.log(offerFromPeer)
      console.log(initiator)

      offerFromPeer.peerObj.signal(initiator)
    })

    this.props.socket.on('user-joining', socketData => {
      console.log('on user joining', this.state.userId)
      const peer = new Peer({
        initiator: true,
        trickle: false
      })

      // WARN: this.state.userId needs to be referenced directly
      peer.on('signal', data => {
        console.log('sending offer', this.state.userId, socketData.guestId)
        this.props.socket.emit('offer', {
          roomId,
          initiator: data,
          offerFrom: this.state.userId,
          offerTo: socketData.guestId
        })
      })

      peer.on('connect', data => { console.log('joining connected!!!', data) })

      this.setState({ peers: [...this.state.peers, { id: socketData.guestId, peerObj: peer }] }, console.log('peers', this.state.peers))
    })

    this.props.socket.on('answer', socketData => {
      console.log('answer', socketData, this.state.userId)
      const { answerFrom, answer } = socketData

      const answerFromPeer = this.state.peers.find(peer => answerFrom === peer.id)

      answerFromPeer.peerObj.signal(answer)
      // gets the answer, if successful it emits the connect event
      // peer.signal(data.answer)
    })


    if (!first) {
      this.props.socket.emit('join-room', { roomId })
    }

    this.props.socket.on('failed-join', () => alert('failed to join room!'))

    // peer.on('error', err => console.error('peer-join-error', err))

    // peer.on('signal', data => {
    //   this.props.socket.emit('answer', { name: roomName, answer: data })
    // })

    // peer.on('connect', () => {
    //   console.log(`Peer Connected on: ${Date.now()}`)
    //   this.onConnected(peer)
    //   this.setState({ state: 'room' })
    // })

    // this.props.socket.on('offer', data => {
    //   // digest offer, return answer (in `peer.on('signal')`)
    //   peer.signal(data.offer)
    // })

    // this.props.socket.on('failed-join', data => {
    //   alert(`failed to join room ${roomName}`)
    // })

    // this.setState({ state: 'joining' })
    // // tell server i want to join a room, get offer back in `this.props.socket.on('offer')`
    // this.props.socket.emit('join-room', { name: roomName })
  }

  handleState = (s) => {
    switch (s) {
      case 'start':
        return <RoomForm
          handleCreateRoom={this.onCreateRoom}
          handleJoinRoom={this.onJoinRoom}
        />
      case 'joining':
        return <JoiningRoom />
      case 'room':
        return <ChatBox
          userName={this.state.userName}
          chats={this.state.chats}
          handleSendChat={this.onSendChat}
        />
      default: return <div />
    }
  }

  render () {
    return (
      <Background>
        <Container>
          <Topbar>
            <Title>TylerChat</Title>
          </Topbar>
          {this.handleState(this.state.state)}
        </Container>
      </Background>
    )
  }
}

export const AppWithContext = () =>
  <SocketContext.Consumer>
    {socket => <App socket={socket} />}
  </SocketContext.Consumer>

export default AppWithContext