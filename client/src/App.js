import React, { useState } from 'react'
import styled from 'styled-components'
import Peer from 'simple-peer'
import SocketContext from './SocketContext'

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

const parseIncomingData = (data) => {
  if (typeof data === 'string') {
    return data
  } else {
    return JSON.parse(new TextDecoder('utf-8').decode(data))
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

const App = ({ socket }) => {
  const [state, setState] = useState('start')
  const [peerObj, setPeerObj] = useState({})
  const [chats, setChats] = useState([])
  const [userName, setUserName] = useState('')

  const onSendChat = (chatText) => {
    const message = { from: userName, text: chatText }
    setChats(c => [...c, message])
    peerObj.send(JSON.stringify(message))
  }

  const handleIncomingData = (data) => {
    const result = parseIncomingData(data)

    const message = { from: result.from, text: result.text }

    setChats(c => [...c, message])
  }

  const onConnected = (peer) => {
    setPeerObj(peer)

    peer.on('error', err => console.error('connected-error', err))

    peer.on('data', data => handleIncomingData(data))
  }

  const onCreateRoom = (roomName, userName) => {
    setUserName(userName)

    const peer = new Peer({
      initiator: true,
      trickle: false
    })

    peer.on('error', err => console.error('peer-init-error', err))

    peer.on('signal', data => {
      // created automatically by the peer since initiator is true
      // send offer to server
      socket.emit('create-room', { name: roomName, initiator: data })
      setState('room')
    })

    peer.on('connect', () => {
      console.log(`Host Connected on: ${Date.now()}`)
      peer.send(JSON.stringify({ text: 'first message from init!' }))
      onConnected(peer)
    })

    socket.on('failed-create', data => {
      alert(`failed to create room ${roomName}`)
    })

    socket.on('answer', data => {
      // gets the answer, if successful it emits the connect event
      peer.signal(data.answer)
    })
  }

  const onJoinRoom = (roomName, userName) => {
    setUserName(userName)

    const peer = new Peer({
      initiator: false,
      trickle: false
    })

    peer.on('error', err => console.error('peer-join-error', err))

    peer.on('signal', data => {
      socket.emit('answer', { name: roomName, answer: data })
    })

    peer.on('connect', () => {
      console.log(`Peer Connected on: ${Date.now()}`)
      peer.send(JSON.stringify({ text: 'first message!' }))

      onConnected(peer)
      setState('room')
    })

    socket.on('offer', data => {
      // digest offer, return answer (in `.on('signal')`)
      peer.signal(data.offer)
    })

    socket.on('failed-join', data => {
      alert(`failed to join room ${roomName}`)
    })

    setState('joining')
    // tell server i want to join a room, get offer back in `on('offer)`
    socket.emit('join-room', { name: roomName })
  }

  const handleState = (s) => {
    switch (s) {
      case 'start':
        return <RoomForm
          handleCreateRoom={onCreateRoom}
          handleJoinRoom={onJoinRoom}
        />
      case 'joining':
        return <JoiningRoom />
      case 'room':
        return <ChatBox
          userName={userName}
          chats={chats}
          handleSendChat={onSendChat}
        />
      default: return <div />
    }
  }

  return (
    <Background>
      <Container>
        <Topbar>
          <Title>TylerChat</Title>
        </Topbar>
        {handleState(state)}
      </Container>
    </Background>
  )
}

export const AppWithContext = () =>
  <SocketContext.Consumer>
    {socket => <App socket={socket} />}
  </SocketContext.Consumer>

export default AppWithContext
