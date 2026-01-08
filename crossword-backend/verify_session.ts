import axios from 'axios'

const API_URL = 'http://localhost:3000/api'
let token: string = ''
let userId: number = 0
let puzzleId: number = 1 // Assuming puzzle ID 1 exists
let firstSessionId: string = ''

async function runTest() {
  try {
    // 1. Register/Login a user
    const username = `testuser_${Date.now()}`
    const password = 'password123'
    console.log(`Registering user: ${username}`)

    try {
      const regRes = await axios.post(`${API_URL}/auth/register`, { username, password })
      token = regRes.data.token
      userId = regRes.data.user.id
    } catch (e) {
      // If register fails (maybe seed data issue), try login
      console.log('Register failed, trying login with default...')
      const loginRes = await axios.post(`${API_URL}/auth/login`, {
        username: 'user1',
        password: 'password',
      })
      token = loginRes.data.token
    }

    if (!token) throw new Error('Failed to get token')

    console.log('Got token:', token.substring(0, 10) + '...')

    // 2. Create a session
    console.log('Creating first session...')
    const createRes = await axios.post(
      `${API_URL}/sessions`,
      { puzzleId },
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    )
    firstSessionId = createRes.data.sessionId
    console.log('First Session ID:', firstSessionId)

    // 3. Update session state
    console.log('Updating session state...')
    await axios.put(`${API_URL}/sessions/${firstSessionId}`, {
      state: [['A', 'B', 'C']],
    })

    // Verify state was updated
    const getRes = await axios.get(`${API_URL}/sessions/${firstSessionId}`)
    if (JSON.stringify(getRes.data.sessionState) !== JSON.stringify([['A', 'B', 'C']])) {
      throw new Error('State update failed')
    }
    console.log('State updated and verified.')

    // 4. Start "Fresh" - Create session again
    console.log('Starting fresh (calling POST /sessions again)...')
    const freshRes = await axios.post(
      `${API_URL}/sessions`,
      { puzzleId },
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    )
    const freshSessionId = freshRes.data.sessionId
    console.log('Fresh Session ID:', freshSessionId)

    // 5. Verify results
    if (freshSessionId !== firstSessionId) {
      console.error('FAIL: Expected session ID to match!')
    } else {
      console.log('PASS: Session ID matches.')
    }

    const freshGetRes = await axios.get(`${API_URL}/sessions/${freshSessionId}`)
    const freshState = freshGetRes.data.sessionState
    console.log('Fresh State:', freshState)

    if (
      JSON.stringify(freshState) !== '[]' &&
      (!Array.isArray(freshState) || freshState.length !== 0)
    ) {
      console.error('FAIL: Expected state to be empty array!')
    } else {
      console.log('PASS: State is empty.')
    }
  } catch (error: any) {
    console.error('Test Failed:', error.response ? error.response.data : error.message)
  }
}

runTest()
